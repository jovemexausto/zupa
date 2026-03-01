import { defineNode } from '@zupa/engine';
import { ActiveSession, finalizeResponse, retryIdempotent, withTimeout, type RuntimeEngineContext, type LLMResponse, type AgentContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * response_finalize
 */
export const responseFinalizeNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state, config } = context;

  const replyTarget = state.replyTarget;
  const user = state.user;
  const session = state.session;

  if (!user || !session || !replyTarget) return { stateDiff: {}, nextTasks: ['persistence_hooks'] };

  const agentContext: AgentContext<unknown> = {
    user,
    session: session as ActiveSession,
    inbound: context.inbound!,
    resources: context.resources,
    config: context.config,
    replyTarget,
    language: config.language || 'en',
    endSession: async () => {
      await resources.database.endSession(session.id, 'Session ended by agent');
    }
  };

  let llmResponse = state.llmResponse;

  // Step 1: Handle deferred streaming logic
  if (!llmResponse) {
    if (config.finalizationStrategy === 'streaming' && context.inbound.source === 'ui_channel' && resources.reactiveUi && resources.llm.stream && state.builtPrompt) {

      // Predetermine voice vs text to see if we fall back to buffered
      const preference = user.preferences.preferredReplyFormat || 'mirror';
      const enforcer = config.modality || 'auto';
      let prefersVoice = false;

      if (enforcer === 'voice') prefersVoice = true;
      else if (enforcer === 'text') prefersVoice = false;
      else if (preference === 'voice') prefersVoice = true;
      else if (preference === 'text') prefersVoice = false;
      else if (preference === 'mirror') prefersVoice = (state.inputModality === 'voice');
      else if (preference === 'dynamic') {
        const hasVoiceReq = /voice|audio|speak|falar|áudio/i.test(state.resolvedContent || '');
        const hasTextReq = /text|texto|escreve/i.test(state.resolvedContent || '');
        if (hasVoiceReq && !hasTextReq) prefersVoice = true;
        else if (hasTextReq && !hasVoiceReq) prefersVoice = false;
        else prefersVoice = (state.inputModality === 'voice');
      }

      const messages = state.assembledContext?.history.map(m => ({ role: m.role, content: m.contentText })) || [];

      if (prefersVoice) {
        // Fall back to buffered if voice
        llmResponse = await withTimeout({
          timeoutMs: config.llmTimeoutMs ?? 30_000,
          label: 'LLM complete',
          run: () => retryIdempotent({
            maxRetries: config.maxIdempotentRetries ?? 2,
            baseDelayMs: config.retryBaseDelayMs ?? 75,
            jitterMs: config.retryJitterMs ?? 25,
            run: () => resources.llm.complete({ messages, systemPrompt: state.builtPrompt!, outputSchema: config.outputSchema, tools: config.tools })
          })
        })
      } else {
        // Stream text
        const stream = resources.llm.stream({ messages, systemPrompt: state.builtPrompt!, outputSchema: config.outputSchema, tools: config.tools });
        const clientId = context.inbound.clientId!;
        let resolvedResponse: LLMResponse | undefined;
        while (true) {
          const res = await stream.next();
          if (res.done) {
            resolvedResponse = res.value;
            break;
          }
          resources.reactiveUi.emitTokenChunk(clientId, res.value);
        }
        if (!resolvedResponse) throw new Error("Stream finalized without completion response.");
        llmResponse = resolvedResponse;
      }
    } else {
      return { stateDiff: {}, nextTasks: ['persistence_hooks'] };
    }
  }

  if (!llmResponse) return { stateDiff: {}, nextTasks: ['persistence_hooks'] };

  const structured = llmResponse.structured;
  const structuredRecord = (structured !== null && typeof structured === 'object') ? structured as Record<string, unknown> : undefined;
  const replyText = llmResponse.content || (typeof structuredRecord?.reply === 'string' ? structuredRecord.reply : undefined);

  if (structured !== undefined && structured !== null && config.onResponse) {
    await (config.onResponse as (s: unknown, ctx: unknown) => Promise<void>)(structured, agentContext);
  }

  // 2. Finalize messaging if we have a reply and necessary context
  let outputModality: 'text' | 'voice' = 'text';
  if (replyText) {
    if (replyTarget && user && session) {
      // 2. Decide output modality
      const preference = user.preferences.preferredReplyFormat || 'mirror';
      const enforcer = config.modality || 'auto';

      let preferredVoiceReply = false;

      if (enforcer === 'voice') {
        preferredVoiceReply = true;
      } else if (enforcer === 'text') {
        preferredVoiceReply = false;
      } else if (preference === 'voice') {
        preferredVoiceReply = true;
      } else if (preference === 'text') {
        preferredVoiceReply = false;
      } else if (preference === 'mirror') {
        preferredVoiceReply = (state.inputModality === 'voice');
      } else if (preference === 'dynamic') {
        // dynamic strategy: Structured -> Custom Extractor -> Heuristic -> Mirror
        const llmChoice = structuredRecord?.modality;

        if (llmChoice === 'voice') {
          preferredVoiceReply = true;
        } else if (llmChoice === 'text') {
          preferredVoiceReply = false;
        } else {
          // Try custom extractor
          const customChoice = config.dynamicModalityExtractor
            ? config.dynamicModalityExtractor(state, agentContext)
            : undefined;

          if (customChoice === 'voice') {
            preferredVoiceReply = true;
          } else if (customChoice === 'text') {
            preferredVoiceReply = false;
          } else {
            // Heuristic fallback
            const hasVoiceRequest = /voice|audio|speak|falar|áudio/i.test(state.resolvedContent || '');
            const hasTextRequest = /text|texto|escreve/i.test(state.resolvedContent || '');

            if (hasVoiceRequest && !hasTextRequest) {
              preferredVoiceReply = true;
            } else if (hasTextRequest && !hasVoiceRequest) {
              preferredVoiceReply = false;
            } else {
              // Final Fallback: Mirror
              preferredVoiceReply = (state.inputModality === 'voice');
            }
          }
        }
      }

      const result = await finalizeResponse({
        input: {
          replyTarget,
          replyText,
          preferredVoiceReply,
          userId: user.id,
          sessionId: session.id,
        },
        ttsProvider: resources.tts,
        messaging: resources.transport,
        config: {
          ttsVoice: config.ttsVoice || 'alloy',
          agentLanguage: config.language || 'en',
          ...(config.ttsTimeoutMs !== undefined && { ttsTimeoutMs: config.ttsTimeoutMs }),
          ...(config.maxIdempotentRetries !== undefined && { maxIdempotentRetries: config.maxIdempotentRetries }),
          ...(config.retryBaseDelayMs !== undefined && { retryBaseDelayMs: config.retryBaseDelayMs }),
          ...(config.retryJitterMs !== undefined && { retryJitterMs: config.retryJitterMs })
        },
      });
      outputModality = result.outputModality;
    }
  }

  return {
    stateDiff: { outputModality, llmResponse },
    nextTasks: ['persistence_hooks']
  };
});
