import { defineNode } from '@zupa/engine';
import { type RuntimeKernelContext, type UserRecord } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * session_attach
 */
export const sessionAttachNode = defineNode<RuntimeState, RuntimeKernelContext>(async (context) => {
  const { resources, state } = context;
  const user = state.user as UserRecord; // Standardized user resolution should happen here or in access policy

  if (!user) {
    return { stateDiff: {}, nextTasks: ['command_dispatch_gate'] };
  }

  let session = await resources.database.findActiveSession(user.id);
  if (!session) {
    session = await resources.database.createSession(user.id);
  }

  return {
    stateDiff: { session },
    nextTasks: ['command_dispatch_gate']
  };
});
