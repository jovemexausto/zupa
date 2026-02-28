import { z } from 'zod';

import { definePhase } from '../phase';
import { AccessStateSchema } from './stateSchemas';
import { normalizeExternalUserId, resolveReplyTarget } from '../../domain';

/**
 * access_policy
 *
 * Purpose:
 * - Decide whether request is allowed to proceed.
 *
 * Contract:
 * - requires: none
 * - provides: `state.access`
 *
 * Placeholder behavior:
 * - Enforces optional `config.singleUser` check.
 * - Emits minimal allow/deny record.
 * - No transport/provider side effects.
 */
export const accessPolicyPhase = definePhase({
  name: 'access_policy',
  requires: z.object({}),
  provides: z.object({ access: AccessStateSchema }),
  async run(context) {
    const inboundFrom = context.inbound.from;
    const inboundExternalUserId = normalizeExternalUserId(inboundFrom);
    const singleUser = context.config.singleUser;

    if (singleUser && inboundExternalUserId !== singleUser) {
      const replyTarget = resolveReplyTarget(inboundFrom, inboundExternalUserId);
      await context.resources.transport.sendText(
        replyTarget,
        'This agent is currently restricted to a single configured user.'
      );
      context.state.access = { allowed: false, reason: 'single_user_mismatch' };
      return;
    }

    context.state.access = { allowed: true };
  }
});
