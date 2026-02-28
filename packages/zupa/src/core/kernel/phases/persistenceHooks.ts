import { z } from 'zod';

import { endSessionWithKvHandoff } from '../../../capabilities/session/sessionLifecycle';
import type { SessionWithKV } from '../../../capabilities/session/kv';
import type { UserRecord } from '../../domain/models/user';
import { definePhase } from '../phase';
import {
  ContentStateSchema,
  FinalStateSchema,
  PersistenceStateSchema,
  ReplyDraftStateSchema,
  ReplyTargetStateSchema,
  SessionStateSchema,
  SessionRefStateSchema,
  UserStateSchema,
  UserRefStateSchema
} from './stateSchemas';

/**
 * persistence_hooks
 *
 * Purpose:
 * - Persist execution artifacts after response finalization.
 *
 * Contract:
 * - requires: `state.final`, `state.userRef`, `state.sessionRef`, `state.content`
 * - provides: `state.persistence`
 *
 * Placeholder behavior:
 * - Writes `{ saved: true }` marker only.
 * - No real repository writes yet.
 */
export const persistenceHooksPhase = definePhase({
  name: 'persistence_hooks',
  requires: z.object({
    final: FinalStateSchema,
    replyDraft: ReplyDraftStateSchema.optional(),
    replyTarget: ReplyTargetStateSchema.optional(),
    user: UserStateSchema.optional(),
    session: SessionStateSchema.optional(),
    commandHandled: z.boolean().optional(),
    userRef: UserRefStateSchema,
    sessionRef: SessionRefStateSchema,
    content: ContentStateSchema
  }),
  provides: z.object({ persistence: PersistenceStateSchema }),
  async run(context) {
    if (context.state.commandHandled === true) {
      context.state.persistence = { saved: true };
      return;
    }

    const user = context.state.user as UserRecord | undefined;
    const session = context.state.session as SessionWithKV | undefined;
    const replyTarget = context.state.replyTarget as string | undefined;
    const content = context.state.content as z.infer<typeof ContentStateSchema>;
    const final = context.state.final as z.infer<typeof FinalStateSchema>;
    const replyDraft = context.state.replyDraft as z.infer<typeof ReplyDraftStateSchema> | undefined;
    if (!user || !session || !replyTarget) {
      context.state.persistence = { saved: true };
      return;
    }

    const userMessage = await context.resources.database.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: 'user',
      contentText: content.contentText,
      inputModality: content.inputModality,
      outputModality: (final.outputModality ?? 'text') as 'text' | 'voice',
      tokensUsed: { promptTokens: 0, completionTokens: 0 },
      latencyMs: 0,
      metadata: {}
    });
    await context.resources.database.incrementSessionMessageCount(session.id);

    const assistantMessage = await context.resources.database.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: 'assistant',
      contentText: final.replyText ?? replyDraft?.text ?? '',
      inputModality: content.inputModality,
      outputModality: final.outputModality,
      tokensUsed: replyDraft?.tokensUsed ?? { promptTokens: 0, completionTokens: 0 },
      latencyMs: Math.max(0, Date.now() - context.meta.startedAt.getTime()),
      metadata: {}
    });
    await context.resources.database.incrementSessionMessageCount(session.id);

    if (context.config.onResponse) {
      const payload =
        replyDraft?.structured
        && typeof replyDraft.structured === 'object'
          ? (replyDraft.structured as Record<string, unknown>)
          : { reply: final.replyText ?? replyDraft?.text ?? '' };

      await context.config.onResponse(payload, {
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
                // TODO: it should use LLM for summary
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

    context.state.persistence = {
      saved: true,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id
    };
  }
});
