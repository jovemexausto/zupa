import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import type { AgentLanguage } from '../../core/domain';
import type { MessagingTransportPort, TTSProviderPort } from '../../core/ports';
import { retryIdempotent, withTimeout } from '../../core/utils';

interface FinalizeResponseInput {
  input: {
    replyTarget: string;
    replyText: string;
    preferredVoiceReply: boolean;
    userId: string;
    sessionId: string;
  };
  ttsProvider: Pick<TTSProviderPort, 'synthesize'>;
  messaging: MessagingTransportPort;
  config: {
    audioStoragePath: string;
    ttsVoice: string;
    agentLanguage: AgentLanguage;
    ttsTimeoutMs?: number;
    maxIdempotentRetries?: number;
    retryBaseDelayMs?: number;
    retryJitterMs?: number;
  };
}

export async function finalizeResponse(input: FinalizeResponseInput): Promise<{
  outputModality: 'text' | 'voice';
  contentAudioUrl: string | null;
}> {
  const textReply = async () => {
    await input.messaging.sendText(input.input.replyTarget, input.input.replyText);
    return { outputModality: 'text' as const, contentAudioUrl: null };
  };

  if (!input.input.preferredVoiceReply) {
    return textReply();
  }

  try {
    await mkdir(input.config.audioStoragePath, { recursive: true });
    const outputPath = path.join(input.config.audioStoragePath, 'outbound.ogg');
    const synthesized = await withTimeout({
      timeoutMs: input.config.ttsTimeoutMs ?? 15_000,
      label: 'TTS synthesis',
      run: async () => retryIdempotent({
        maxRetries: input.config.maxIdempotentRetries ?? 2,
        baseDelayMs: input.config.retryBaseDelayMs ?? 75,
        jitterMs: input.config.retryJitterMs ?? 25,
        run: async () => {
          return input.ttsProvider.synthesize({
            text: input.input.replyText,
            voice: input.config.ttsVoice,
            outputPath,
            language: input.config.agentLanguage
          });
        }
      })
    });

    await input.messaging.sendVoice(input.input.replyTarget, synthesized.audioPath);
    return {
      outputModality: 'voice',
      contentAudioUrl: path.basename(synthesized.audioPath)
    };
  } catch {
    return textReply();
  }
}
