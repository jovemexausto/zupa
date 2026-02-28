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

  if (llmResponse.content) {
    const replyTarget = state.replyTarget;
    const user = state.user;
    const session = state.session;

    if (replyTarget && user && session) {
      await finalizeResponse({
        input: {
          replyTarget,
          replyText: llmResponse.content,
          preferredVoiceReply: config.preferredVoiceReply || false,
          userId: user.id,
          sessionId: session.id,
        },
        ttsProvider: resources.tts,
        messaging: resources.transport,
        config: {
          audioStoragePath: config.audioStoragePath || './data/audio',
          ttsVoice: config.ttsVoice || 'alloy',
          agentLanguage: config.language || 'en',
        },
      });
    }
  }

  return {
    stateDiff: {},
    nextTasks: ['persistence_hooks']
  };
});
