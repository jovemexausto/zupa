import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * content_resolution
 */
export const contentResolutionNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, inbound, config } = context;

  let body = inbound.body;

  if (inbound.audioPath && resources.stt) {
    const { transcript } = await resources.stt.transcribe({
      audioPath: inbound.audioPath,
      language: config.language || 'en'
    });
    body = transcript;
  }

  return {
    stateDiff: {
      resolvedContent: body,
      inbound: { ...inbound, body }
    },
    nextTasks: ['context_assembly']
  };
});
