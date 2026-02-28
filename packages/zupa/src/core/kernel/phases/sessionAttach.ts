import { z } from 'zod';

import { definePhase } from '../phase';
import { SessionKVStore } from '../../../capabilities/session/kv';
import { normalizeExternalUserId, resolveReplyTarget } from '../../domain';
import {
  AccessStateSchema,
  CreatedUserStateSchema,
  InboundDuplicateStateSchema,
  ReplyTargetStateSchema,
  SessionRefStateSchema,
  SessionStateSchema,
  UserRefStateSchema,
  UserStateSchema
} from './stateSchemas';

/**
 * session_attach
 *
 * Purpose:
 * - Attach minimal user/session references to shared state.
 *
 * Contract:
 * - requires: `state.access`
 * - provides: `state.userRef`, `state.sessionRef`
 *
 * Placeholder behavior:
 * - Derives deterministic IDs from inbound sender/requestId.
 * - No repository writes yet.
 */
export const sessionAttachPhase = definePhase({
  name: 'session_attach',
  requires: z.object({ access: AccessStateSchema }),
  provides: z.object({
    userRef: UserRefStateSchema,
    sessionRef: SessionRefStateSchema,
    user: UserStateSchema.optional(),
    session: SessionStateSchema.optional(),
    replyTarget: ReplyTargetStateSchema,
    createdUser: CreatedUserStateSchema,
    inboundDuplicate: InboundDuplicateStateSchema
  }),
  async run(context) {
    const inboundFrom = context.inbound.from;
    const externalUserId = normalizeExternalUserId(inboundFrom);
    const replyTarget = resolveReplyTarget(inboundFrom, externalUserId);

    if ((context.state.access as { allowed: boolean }).allowed === false) {
      context.state.replyTarget = replyTarget;
      context.state.createdUser = false;
      context.state.inboundDuplicate = false;
      context.state.userRef = { id: `blocked:${externalUserId}` };
      context.state.sessionRef = {
        id: `blocked:${context.meta.requestId}`,
        userId: `blocked:${externalUserId}`
      };
      return;
    }

    const inboundId = context.inbound.id?.trim();
    if (inboundId) {
      const dedupKey = `${externalUserId}:${inboundId}`;
      const claim = await context.resources.database.claimInboundEvent(dedupKey);
      if (claim === 'duplicate') {
        context.state.replyTarget = replyTarget;
        context.state.createdUser = false;
        context.state.inboundDuplicate = true;
        context.state.userRef = { id: `duplicate:${externalUserId}` };
        context.state.sessionRef = {
          id: `duplicate:${context.meta.requestId}`,
          userId: `duplicate:${externalUserId}`
        };
        return;
      }
    }

    const existingUser = await context.resources.database.findUser(externalUserId);
    const user = existingUser
      ?? await context.resources.database.createUser({
        externalUserId,
        displayName: 'Unknown'
      });
    const createdUser = existingUser === null;

    await context.resources.database.touchUserLastActive(user.id);

    const activeSession = await context.resources.database.findActiveSession(user.id);
    let sessionRecord = activeSession;
    if (activeSession) {
      const idleTimeoutMs = (context.config.sessionIdleTimeoutMinutes ?? 30) * 60_000;
      const lastMessage = (await context.resources.database.getRecentMessages(activeSession.id, 1)).at(-1);
      const lastActivityAt = lastMessage?.createdAt ?? activeSession.startedAt;
      if (Date.now() - lastActivityAt.getTime() >= idleTimeoutMs) {
        await context.resources.database.endSession(
          activeSession.id,
          `Session ended due to inactive timeout at ${new Date().toISOString()}`
        );
        sessionRecord = null;
      }
    }
    if (sessionRecord === null) {
      sessionRecord = await context.resources.database.createSession(user.id);
    }

    const sessionKv = await context.resources.database.getSessionKV(sessionRecord.id);
    const sessionWithKv = {
      ...sessionRecord,
      kv: new SessionKVStore(sessionRecord.id, context.resources.database, sessionKv)
    };

    context.state.user = user;
    context.state.session = sessionWithKv;
    context.state.replyTarget = replyTarget;
    context.state.createdUser = createdUser;
    context.state.inboundDuplicate = false;
    context.state.userRef = { id: user.id };
    context.state.sessionRef = {
      id: sessionRecord.id,
      userId: user.id
    };
  }
});
