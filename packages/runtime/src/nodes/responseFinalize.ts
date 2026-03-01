import { defineNode } from '@zupa/engine';
import { finalizeResponse, type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * response_finalize
 */
export const responseFinalizeNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state, config } = context;
  const llmResponse = state.llmResponse;

  if (!llmResponse) return { stateDiff: {}, nextTasks: ['persistence_hooks'] };

  const structured = llmResponse.structured;
  const structuredRecord = (structured !== null && typeof structured === 'object') ? structured as Record<string, unknown> : undefined;
  const replyText = llmResponse.content || (typeof structuredRecord?.reply === 'string' ? structuredRecord.reply : undefined);

  const replyTarget = state.replyTarget;
  const user = state.user;
  const session = state.session;

  if (!user || !session || !replyTarget) return { stateDiff: {}, nextTasks: ['persistence_hooks'] };

  const agentContext = {
    user,
    session: session as import('@zupa/core').ActiveSession,
    inbound: context.inbound!,
    resources: context.resources,
    config: context.config,
    replyTarget,
    language: config.language || 'en',
    endSession: async () => {
      await resources.database.endSession(session.id, 'Session ended by agent');
    }
  };

  if (structured !== undefined && structured !== null && config.onResponse) {
    // structured and agentContext are typed as unknown at this layer;
    // onResponse is called with the runtime context, types verified at config level
    await (config.onResponse as (s: unknown, ctx: unknown) => Promise<void>)(structured, agentContext);
  }

  // 2. Finalize messaging if we have a reply and necessary context
  let outputModality: 'text' | 'voice' = 'text';
  if (replyText) {
    const replyTarget = state.replyTarget;
    const user = state.user;
    const session = state.session;

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
    stateDiff: { outputModality },
    nextTasks: ['persistence_hooks']
  };
});
