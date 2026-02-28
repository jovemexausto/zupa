import { z } from 'zod';

import { endSessionWithKvHandoff } from '../../../capabilities/session/sessionLifecycle';
import type { SessionWithKV } from '../../../capabilities/session/kv';
import type { UserRecord } from '../../domain/models/user';
import { ChatMessage } from '../../domain/chat';
import { definePhase } from '../phase';
import {
  AssembledContextStateSchema,
  ContentStateSchema,
  ReplyTargetStateSchema,
  SessionStateSchema,
  SessionRefStateSchema,
  UserStateSchema,
  UserRefStateSchema
} from './stateSchemas';

/**
 * context_assembly
 *
 * Purpose:
 * - Assemble contextual data used by prompt construction and later orchestration.
 *
 * Contract:
 * - requires: `state.userRef`, `state.sessionRef`, `state.content`
 * - provides: `state.assembledContext`
 *
 * Placeholder behavior:
 * - Writes deterministic metadata (`requestId`, `language`).
 * - No external side effects.
 */
export const contextAssemblyPhase = definePhase({
  name: 'context_assembly',
  requires: z.object({
    userRef: UserRefStateSchema,
    sessionRef: SessionRefStateSchema,
    content: ContentStateSchema,
    user: UserStateSchema.optional(),
    session: SessionStateSchema.optional(),
    replyTarget: ReplyTargetStateSchema.optional()
  }),
  provides: z.object({ assembledContext: AssembledContextStateSchema }),
  async run(context) {
    const user = context.state.user as UserRecord | undefined;
    const session = context.state.session as SessionWithKV | undefined;
    const replyTarget = context.state.replyTarget as string | undefined;
    const content = context.state.content as z.infer<typeof ContentStateSchema>;

    if (!user || !session || !replyTarget) {
      context.state.assembledContext = {
        requestId: context.meta.requestId,
        language: context.config.language,
        inboundText: content.contentText,
        workingMemory: [] as ChatMessage[],
        previousSessions: [] as string[],
        userFacts: [] as string[]
      };
      return;
    }

    const historyRows = await context.resources.database.getRecentMessages(
      session.id,
      context.config.maxWorkingMemory ?? 20
    );
    const workingMemory: ChatMessage[] = historyRows
      .filter((row) => row.role === 'user' || row.role === 'assistant' || row.role === 'tool')
      .map((row) => ({
        role: row.role as 'user' | 'assistant' | 'tool',
        content: row.contentText
      }));

    const [previousSessions, userFacts] = await Promise.all([
      context.resources.database.getRecentSummaries(user.id, context.config.maxEpisodicMemory ?? 3),
      context.resources.vectors.search(user.id, content.contentText, context.config.semanticSearchLimit ?? 3)
    ]);

    let injectedContext: Record<string, unknown> = {};
    if (context.config.context) {
      injectedContext = await context.config.context({
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
              endSessionWithSummary: async (sessionId, endedAt, sessionKv) => {
                const summary = `Session ended at ${endedAt.toISOString()}`;
                await context.resources.database.endSession(sessionId, summary);
                if (sessionKv) {
                  await context.resources.database.updateSessionKV(sessionId, sessionKv);
                }
              }
            }
          });
        }
      });
    }

    context.state.assembledContext = {
      requestId: context.meta.requestId,
      language: context.config.language,
      user,
      session,
      inbound: context.inbound,
      inboundText: content.contentText,
      workingMemory,
      previousSessions,
      userFacts: userFacts.map((fact) => fact.text),
      ...injectedContext
    };
  }
});
