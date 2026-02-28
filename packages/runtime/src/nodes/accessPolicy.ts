import { defineNode } from '@zupa/engine';
import { normalizeExternalUserId, resolveReplyTarget, type RuntimeKernelContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * access_policy
 *
 * Purpose:
 * - Decide whether request is allowed to proceed.
 */
export const accessPolicyNode = defineNode<RuntimeState, RuntimeKernelContext>(async (context) => {
  const inboundFrom = context.inbound.from;
  const inboundExternalUserId = normalizeExternalUserId(inboundFrom);
  const singleUser = context.config.singleUser;

  if (singleUser && inboundExternalUserId !== singleUser) {
    const replyTarget = resolveReplyTarget(inboundFrom, inboundExternalUserId);
    await context.resources.transport.sendText(
      replyTarget,
      'This agent is currently restricted to a single configured user.'
    );
    return {
      stateDiff: { access: { allowed: false, reason: 'single_user_mismatch' } },
      nextTasks: [] // exit graph
    };
  }

  let user = await context.resources.database.findUser(inboundExternalUserId);
  if (!user) {
    user = await context.resources.database.createUser({
      externalUserId: inboundExternalUserId,
      displayName: inboundFrom.split(':')[0] || 'Unknown User'
    });
  }

  return {
    stateDiff: { access: { allowed: true }, user },
    nextTasks: ['session_attach']
  };
});
