import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * context_assembly
 */
export const contextAssemblyNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state, config } = context;
  const user = state.user;
  const session = state.session;

  if (!user || !session) {
    return { stateDiff: {}, nextTasks: ['prompt_build'] };
  }

  const recentMessages = await resources.database.getRecentMessages(session.id, config.maxWorkingMemory || 20);
  const recentSummaries = await resources.database.getRecentSummaries(user.id, config.maxEpisodicMemory || 3);

  const assembledContext = {
    history: recentMessages,
    summaries: recentSummaries,
    kv: await resources.database.getSessionKV(session.id)
  };

  return {
    stateDiff: { assembledContext },
    nextTasks: ['prompt_build']
  };
});
