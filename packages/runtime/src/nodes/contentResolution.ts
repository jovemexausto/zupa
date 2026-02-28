import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext, resolveInboundContent } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * content_resolution
 */
export const contentResolutionNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, inbound, config } = context;

  const { contentText } = await resolveInboundContent({
    message: inbound,
    sttProvider: resources.stt,
    config: {
      agentLanguage: config.language || 'en',
      ...(config.sttTimeoutMs !== undefined && { sttTimeoutMs: config.sttTimeoutMs }),
      ...(config.maxIdempotentRetries !== undefined && { maxIdempotentRetries: config.maxIdempotentRetries }),
      ...(config.retryBaseDelayMs !== undefined && { retryBaseDelayMs: config.retryBaseDelayMs }),
      ...(config.retryJitterMs !== undefined && { retryJitterMs: config.retryJitterMs })
    }
  });

  return {
    stateDiff: {
      resolvedContent: contentText,
      inbound: { ...inbound, body: contentText }
    },
    nextTasks: ['context_assembly']
  };
});
