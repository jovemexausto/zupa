import { z } from 'zod';

import { resolveInboundContent } from '../../../capabilities/chat/resolveInbound';
import { definePhase } from '../phase';
import { parsePreferencePatch } from '../../domain/preferences';
import {
  CommandHandledStateSchema,
  ContentStateSchema,
  PreferredVoiceReplyStateSchema,
  UserStateSchema
} from './stateSchemas';

/**
 * content_resolution
 *
 * Purpose:
 * - Resolve final inbound text content for downstream prompt/agent phases.
 *
 * Contract:
 * - requires: `state.commandHandled`, `state.user?`
 * - provides: `state.content`, `state.preferredVoiceReply`
 *
 * Placeholder behavior:
 * - If command already handled: writes empty text content.
 * - Otherwise maps inbound body to text modality.
 */
export const contentResolutionPhase = definePhase({
  name: 'content_resolution',
  requires: z.object({
    commandHandled: CommandHandledStateSchema,
    user: UserStateSchema.optional()
  }),
  provides: z.object({
    content: ContentStateSchema,
    preferredVoiceReply: PreferredVoiceReplyStateSchema
  }),
  async run(context) {
    if (context.state.commandHandled === true) {
      context.state.content = { contentText: '', inputModality: 'text' };
      context.state.preferredVoiceReply = false;
      return;
    }

    const resolved = await resolveInboundContent({
      message: context.inbound,
      sttProvider: context.resources.stt,
      config: {
        // TODO: we should not use audioStoragePath, but use the storage abstraction
        // (even better if can have an uniq slug or uuid to store and retrive as kv style
        audioStoragePath: context.config.audioStoragePath ?? './data/audio',
        agentLanguage: context.config.language,
        sttTimeoutMs: context.config.sttTimeoutMs ?? 15_000,
        maxIdempotentRetries: context.config.maxIdempotentRetries ?? 2,
        retryBaseDelayMs: context.config.retryBaseDelayMs ?? 75,
        retryJitterMs: context.config.retryJitterMs ?? 25
      }
    });

    const user = context.state.user as z.infer<typeof UserStateSchema> | undefined;
    if (user) {
      const preferencePatch = parsePreferencePatch(resolved.contentText);
      if (preferencePatch) {
        const merged = { ...user.preferences, ...preferencePatch };
        await context.resources.database.updateUserPreferences(user.id, merged);
        user.preferences = merged;
        context.state.user = user;
      }

      context.state.preferredVoiceReply =
        user.preferences.reply_in_voice === true || resolved.inputModality === 'voice';
    } else {
      context.state.preferredVoiceReply = resolved.inputModality === 'voice';
    }

    context.state.content = {
      contentText: resolved.contentText,
      inputModality: resolved.inputModality
    };
  }
});
