import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import type { AgentLanguage } from '../../core/domain';
import type { InboundMessage, STTProviderPort } from '../../core/ports';
import { retryIdempotent, withTimeout } from '../../core/utils';

interface ResolveInboundContentInput {
  message: InboundMessage;
  sttProvider: Pick<STTProviderPort, 'transcribe'>;
  config: {
    audioStoragePath: string;
    agentLanguage: AgentLanguage;
    sttTimeoutMs?: number;
    maxIdempotentRetries?: number;
    retryBaseDelayMs?: number;
    retryJitterMs?: number;
  };
}

function isVoiceMessage(message: InboundMessage): boolean {
  return Boolean(message.hasMedia && (message.type === 'ptt' || message.type === 'audio') && message.downloadMedia);
}

export async function resolveInboundContent(input: ResolveInboundContentInput): Promise<{
  contentText: string;
  inputModality: 'text' | 'voice';
}> {
  if (!isVoiceMessage(input.message)) {
    return {
      contentText: input.message.body,
      inputModality: 'text'
    };
  }

  const media = await input.message.downloadMedia?.();
  if (!media?.data) {
    return {
      contentText: input.message.body,
      inputModality: 'text'
    };
  }

  // TODO: this should use the storage abstraction
  await mkdir(input.config.audioStoragePath, { recursive: true });
  const audioPath = path.join(input.config.audioStoragePath, `inbound-${Date.now()}.ogg`);
  await writeFile(audioPath, Buffer.from(media.data, 'base64'));

  try {
    const transcript = await withTimeout({
      timeoutMs: input.config.sttTimeoutMs ?? 15_000,
      label: 'STT transcription',
      run: async () => retryIdempotent({
        maxRetries: input.config.maxIdempotentRetries ?? 2,
        baseDelayMs: input.config.retryBaseDelayMs ?? 75,
        jitterMs: input.config.retryJitterMs ?? 25,
        run: async () => {
          return input.sttProvider.transcribe({
            audioPath,
            language: input.config.agentLanguage
          });
        }
      })
    });

    return {
      contentText: transcript.transcript,
      inputModality: 'voice'
    };
  } catch {
    return {
      contentText: input.message.body,
      inputModality: 'text'
    };
  }
}
