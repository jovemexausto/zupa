import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * persistence_hooks
 */
export const persistenceHooksNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state } = context;
  const session = state.session;

  if (session && state.llmResponse) {
    await resources.database.incrementSessionMessageCount(session.id);
  }

  return {
    stateDiff: {},
    nextTasks: ['telemetry_emit']
  };
});
