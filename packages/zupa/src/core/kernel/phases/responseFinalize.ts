import { z } from 'zod';

import { finalizeResponse } from '../../../capabilities/chat/finalizeResponse';
import type { SessionWithKV } from '../../../capabilities/session/kv';
import type { UserRecord } from '../../domain/models/user';
import { definePhase } from '../phase';
import {
  CommandHandledStateSchema,
  FinalStateSchema,
  PreferredVoiceReplyStateSchema,
  ReplyDraftStateSchema,
  ReplyTargetStateSchema,
  SessionStateSchema,
  SessionRefStateSchema,
  UserStateSchema,
  UserRefStateSchema
} from './stateSchemas';

/**
 * response_finalize
 *
 * Purpose:
 * - Convert reply draft into final outbound response metadata.
 *
 * Contract:
 * - requires: `state.replyDraft`, `state.userRef`, `state.sessionRef`, `state.commandHandled`
 * - provides: `state.final`
 *
 * Placeholder behavior:
 * - Emits deterministic text-only final response metadata.
 * - Does not send transport output yet.
 */
export const responseFinalizePhase = definePhase({
  name: 'response_finalize',
  requires: z.object({
    replyDraft: ReplyDraftStateSchema,
    preferredVoiceReply: PreferredVoiceReplyStateSchema.optional(),
    replyTarget: ReplyTargetStateSchema.optional(),
    user: UserStateSchema.optional(),
    session: SessionStateSchema.optional(),
    userRef: UserRefStateSchema,
    sessionRef: SessionRefStateSchema,
    commandHandled: CommandHandledStateSchema
  }),
  provides: z.object({ final: FinalStateSchema }),
  async run(context) {
    const draft = context.state.replyDraft as z.infer<typeof ReplyDraftStateSchema>;
    if (context.state.commandHandled === true) {
      context.state.final = {
        outputModality: 'text',
        contentAudioUrl: null,
        replyText: draft.text
      };
      return;
    }

    const user = context.state.user as UserRecord | undefined;
    const session = context.state.session as SessionWithKV | undefined;
    const replyTarget = context.state.replyTarget as string | undefined;
    if (!user || !session || !replyTarget) {
      context.state.final = {
        outputModality: 'text',
        contentAudioUrl: null,
        replyText: draft.text
      };
      return;
    }

    const preferredVoiceReply = (context.state.preferredVoiceReply as boolean | undefined) ?? false;
    const finalized = await finalizeResponse({
      input: {
        replyTarget,
        replyText: draft.text,
        preferredVoiceReply,
        userId: user.id,
        sessionId: session.id
      },
      ttsProvider: context.resources.tts,
      messaging: context.resources.transport,
      config: {
        audioStoragePath: context.config.audioStoragePath ?? './data/audio',
        ttsVoice: context.config.ttsVoice ?? 'alloy',
        agentLanguage: context.config.language,
        ttsTimeoutMs: context.config.ttsTimeoutMs ?? 15_000,
        maxIdempotentRetries: context.config.maxIdempotentRetries ?? 2,
        retryBaseDelayMs: context.config.retryBaseDelayMs ?? 75,
        retryJitterMs: context.config.retryJitterMs ?? 25
      }
    });

    context.state.final = {
      outputModality: finalized.outputModality,
      contentAudioUrl: finalized.contentAudioUrl,
      replyText: draft.text
    };
  }
});
