import { z } from 'zod';

import { dispatchToolCall } from '../../../capabilities/tools/dispatch';
import { endSessionWithKvHandoff } from '../../../capabilities/session/sessionLifecycle';
import type { SessionWithKV } from '../../../capabilities/session/kv';
import type { UserRecord } from '../../domain/models/user';
import type { ChatMessage } from '../../domain/chat';
import { definePhase } from '../phase';
import { retryIdempotent, withTimeout } from '../../utils';
import {
  CommandHandledStateSchema,
  PromptInputStateSchema,
  ReplyDraftStateSchema,
  ReplyTargetStateSchema,
  SessionStateSchema,
  UserStateSchema
} from './stateSchemas';

/**
 * agentic_loop
 *
 * Purpose:
 * - Produce reply draft from prompt input and command-gate outcome.
 *
 * Contract:
 * - requires: `state.promptInput`, `state.commandHandled`
 * - provides: `state.replyDraft`
 *
 * Placeholder behavior:
 * - If command handled: emits empty reply draft.
 * - Otherwise mirrors latest prompt message content as reply text.
 */
export const agenticLoopPhase = definePhase({
  name: 'agentic_loop',
  requires: z.object({
    promptInput    : PromptInputStateSchema,
    commandHandled : CommandHandledStateSchema,
    user           : UserStateSchema.optional(),
    session        : SessionStateSchema.optional(),
    replyTarget    : ReplyTargetStateSchema.optional()
  }),
  provides: z.object({ replyDraft: ReplyDraftStateSchema }),
  async run(context) {
    if (context.state.commandHandled === true) {
        context.state.replyDraft = { text: '', toolResults: [] };
        return;
    }

    const typedPromptInput = context.state.promptInput as z.infer<typeof PromptInputStateSchema>;
    const user = context.state.user as UserRecord | undefined;
    const session = context.state.session as SessionWithKV | undefined;
    const replyTarget = context.state.replyTarget as string | undefined;
    if (!user || !session || !replyTarget) {
      context.state.replyDraft = {
        text: context.config.fallbackReply,
        toolResults: []
      };
      return;
    }

    let loopMessages: ChatMessage[] = typedPromptInput.messages.map((message) => {
      if (message.toolCallId !== undefined) {
        return {
          role: message.role,
          content: message.content,
          toolCallId: message.toolCallId
        };
      }

      return {
        role: message.role,
        content: message.content
      };
    });
    let toolResults: string[] = [];
    let finalResponse: Awaited<ReturnType<typeof context.resources.llm.complete>> | null = null;
    const llmTimeoutMs = context.config.llmTimeoutMs ?? 20_000;
    const maxIdempotentRetries = context.config.maxIdempotentRetries ?? 2;
    const retryBaseDelayMs = context.config.retryBaseDelayMs ?? 75;
    const retryJitterMs = context.config.retryJitterMs ?? 25;

    const maxToolIterations = context.config.maxToolIterations ?? 3;
    for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
      let llmResponse: Awaited<ReturnType<typeof context.resources.llm.complete>>;
      try {
        const request: Parameters<typeof context.resources.llm.complete>[0] = {
          messages: loopMessages,
          systemPrompt: typedPromptInput.systemPrompt
        };
        if (context.config.outputSchema !== undefined) {
          request.outputSchema = context.config.outputSchema;
        }
        if (context.config.tools !== undefined) {
          request.tools = context.config.tools;
        }
        llmResponse = await retryIdempotent({
          maxRetries: maxIdempotentRetries,
          baseDelayMs: retryBaseDelayMs,
          jitterMs: retryJitterMs,
          run: async () => withTimeout({
            timeoutMs: llmTimeoutMs,
            label: 'LLM completion',
            run: async () => context.resources.llm.complete(request)
          })
        });
      } catch {
        const fallbackRequest: Parameters<typeof context.resources.llm.complete>[0] = {
          messages: loopMessages,
          systemPrompt: typedPromptInput.systemPrompt
        };
        if (context.config.tools !== undefined) {
          fallbackRequest.tools = context.config.tools;
        }
        try {
          llmResponse = await retryIdempotent({
            maxRetries: maxIdempotentRetries,
            baseDelayMs: retryBaseDelayMs,
            jitterMs: retryJitterMs,
            run: async () => withTimeout({
              timeoutMs: llmTimeoutMs,
              label: 'LLM completion',
              run: async () => context.resources.llm.complete(fallbackRequest)
            })
          });
        } catch {
          finalResponse = {
            content: context.config.fallbackReply ?? 'Sorry! I hit a temporary issue. Please try again in a moment.',
            structured: null,
            toolCalls: [],
            tokensUsed: { promptTokens: 0, completionTokens: 0 },
            model: 'timeout-fallback',
            latencyMs: 0
          };
          break;
        }
      }

      if (llmResponse.toolCalls.length === 0) {
        finalResponse = llmResponse;
        break;
      }

      if (iteration === maxToolIterations) {
        finalResponse = {
          ...llmResponse,
          content: context.config.fallbackReply ?? 'Sorry! I hit a temporary issue. Please try again in a moment.',
          structured: null,
          toolCalls: []
        };
        break;
      }

      for (const toolCall of llmResponse.toolCalls) {
        const dispatched = await dispatchToolCall({
          toolCall,
          tools: context.config.tools ?? [],
          timeoutMs: context.config.toolTimeoutMs ?? 12_000,
          context: {
            user,
            session,
            inbound: context.inbound,
            language: context.config.language,
            replyTarget,
            resources: context.resources,
            endSession: async () => {
              await endSessionWithKvHandoff({
                session,
                endedAt: new Date(),
                sessionManager: {
                  endSessionWithSummary: async (sessionId, endedAt, sessionKv) => {
                    const summary = `Session ended at ${endedAt.toISOString()}`;
                    await context.resources.database.endSession(sessionId, summary);
                    if (sessionKv) {
                      await context.resources.database.updateSessionKV(sessionId, sessionKv);
                    }
                  }
                }
              });
            }
          }
        });

        const formatted = dispatched.status === 'ok' ? dispatched.result : dispatched.formatted;
        toolResults = [...toolResults, formatted];
        loopMessages = [...loopMessages, { role: 'tool', content: formatted, toolCallId: toolCall.id }];
      }
    }

    const structuredReply =
      finalResponse?.structured
      && typeof finalResponse.structured === 'object'
      && 'reply' in (finalResponse.structured as Record<string, unknown>)
      && typeof (finalResponse.structured as Record<string, unknown>).reply === 'string'
        ? ((finalResponse.structured as Record<string, unknown>).reply as string)
        : null;

    const source =
      structuredReply
      ?? finalResponse?.content
      ?? typedPromptInput.messages.at(-1)?.content
      ?? (context.config.fallbackReply ?? 'Sorry! I hit a temporary issue. Please try again in a moment.');

    context.state.replyDraft = {
      text        : source,
      structured  : finalResponse?.structured ?? null,
      toolResults ,
      tokensUsed  : finalResponse?.tokensUsed,
      model       : finalResponse?.model,
      latencyMs   : finalResponse?.latencyMs
    };
  }
});
