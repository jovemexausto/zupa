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
  const replyText = llmResponse.content || (structured as any)?.reply;

  const replyTarget = state.replyTarget;
  const user = state.user;
  const session = state.session;

  // 1. Trigger onResponse hook if structured data and hook exist
  if (structured && config.onResponse && replyTarget && user && session) {
    const agentContext = {
      user,
      session,
      inbound: context.inbound,
      resources: context.resources,
      config: context.config,
      replyTarget,
      language: config.language || 'en',
      endSession: async () => {
        await resources.database.endSession(session.id, 'Session ended by agent');
      }
    };
    await config.onResponse(structured as any, agentContext as any);
  }

  // 2. Finalize messaging if we have a reply and necessary context
  let outputModality: 'text' | 'voice' = 'text';
  if (replyText) {
    const replyTarget = state.replyTarget;
    const user = state.user;
    const session = state.session;

    if (replyTarget && user && session) {
      // Mirror input modality OR follow user preference
      const preferredVoiceReply = (user.preferences as any).preferredReplyFormat === 'voice' ||
        (state.inputModality === 'voice' && (user.preferences as any).preferredReplyFormat !== 'text');

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
