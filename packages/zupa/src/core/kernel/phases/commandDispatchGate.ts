import { z } from 'zod';

import { buildCommandRegistry } from '../../../capabilities/commands/registry';
import { dispatchCommandIfPresent } from '../../../capabilities/commands/dispatch';
import { endSessionWithKvHandoff } from '../../../capabilities/session/sessionLifecycle';
import type { SessionWithKV } from '../../../capabilities/session/kv';
import type { UserRecord } from '../../domain/models/user';
import { definePhase } from '../phase';
import {
  AccessStateSchema,
  CommandHandledStateSchema,
  CreatedUserStateSchema,
  InboundDuplicateStateSchema,
  ReplyTargetStateSchema,
  SessionStateSchema,
  SessionRefStateSchema,
  UserStateSchema,
  UserRefStateSchema
} from './stateSchemas';

/**
 * command_dispatch_gate
 *
 * Purpose:
 * - Define whether command flow already handled the request.
 *
 * Contract:
 * - requires: `state.access`, `state.userRef`, `state.sessionRef`
 * - provides: `state.commandHandled`
 *
 * Placeholder behavior:
 * - Initializes `commandHandled` to `false` if absent.
 * - Does not execute command handlers yet.
 */
export const commandDispatchGatePhase = definePhase({
  name: 'command_dispatch_gate',
  requires: z.object({
    access     : AccessStateSchema,
    user       : UserStateSchema.optional(),
    session    : SessionStateSchema.optional(),
    replyTarget: ReplyTargetStateSchema,
    createdUser: CreatedUserStateSchema,
    inboundDuplicate: InboundDuplicateStateSchema,
    userRef    : UserRefStateSchema,
    sessionRef : SessionRefStateSchema
  }),
  provides: z.object({ commandHandled: CommandHandledStateSchema }),
  async run(context) {
    const access = context.state.access as { allowed: boolean };
    if (access.allowed === false) {
      context.state.commandHandled = true;
      return;
    }

    if (typeof context.state.commandHandled === 'boolean') {
      return;
    }
    if (context.state.inboundDuplicate === true) {
      context.state.commandHandled = true;
      return;
    }

    const user = context.state.user as UserRecord | undefined;
    const session = context.state.session as SessionWithKV | undefined;
    const replyTarget = context.state.replyTarget as string;
    if (!user || !session) {
      context.state.commandHandled = true;
      return;
    }

    const recentMessagesCount = await context.resources.database.countUserMessagesSince(
      user.id,
      new Date(Date.now() - 60_000)
    );
    if (recentMessagesCount >= (context.config.rateLimitPerUserPerMinute ?? 20)) {
      await context.resources.transport.sendText(
        replyTarget,
        'You are sending messages too quickly. Please wait a moment and try again.'
      );
      context.state.commandHandled = true;
      return;
    }

    if (context.state.createdUser === true && context.config.welcomeMessage?.trim()) {
      await context.resources.transport.sendText(replyTarget, context.config.welcomeMessage.trim());
    }

    context.state.commandHandled = await dispatchCommandIfPresent({
      rawText: context.inbound.body,
      commandRegistry: buildCommandRegistry(context.config.commands),
      commandContext: {
        user,
        session,
        inbound: context.inbound,
        language: context.config.language,
        replyTarget,
        resources: context.resources,
        endSession: async () => {
          await endSessionWithKvHandoff({
            session,
            endedAt: new Date(),
            sessionManager: {
              endSessionWithSummary: async (sessionId: string, endedAt: Date, sessionKv?: Record<string, unknown>) => {
                const summary = `Session ended at ${endedAt.toISOString()}`;
                await context.resources.database.endSession(sessionId, summary);
                if (sessionKv) {
                  await context.resources.database.updateSessionKV(sessionId, sessionKv);
                }
              }
            }
          });
        }
      },
      llm: context.resources.llm
    });
  }
});
