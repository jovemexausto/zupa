import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext, type User } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * session_attach
 */
export const sessionAttachNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state } = context;
  const user = state.user as User; // Standardized user resolution should happen here or in access policy

  if (!user) {
    return { stateDiff: {}, nextTasks: ['command_dispatch_gate'] };
  }

  let session = await resources.database.findActiveSession(user.id);
  if (!session) {
    session = await resources.database.createSession(user.id);
  }

  const kv = resources.state.attach(session.id);
  const activeSession = { ...session, kv };

  return {
    stateDiff: { session: activeSession },
    nextTasks: ['command_dispatch_gate']
  };
});
