import { createReadStream } from 'node:fs';

import OpenAI from 'openai';

import type { STTProviderPort } from '../../core/ports';

export interface OpenAIWhisperClient {
  audio: {
    transcriptions: {
      create(input: Record<string, unknown>): Promise<{ text?: string }>;
    };
  };
}

export interface OpenAIWhisperSTTProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  client?: OpenAIWhisperClient;
  now?: () => number;
}

// TODO: remove
function toWhisperLanguage(language: Parameters<STTProviderPort['transcribe']>[0]['language']): string {
  return language;
}

export class OpenAIWhisperSTTProvider implements STTProviderPort {
  private readonly client: OpenAIWhisperClient;
  private readonly model: string;
  private readonly now: () => number;

  public constructor(options: OpenAIWhisperSTTProviderOptions) {
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl
      }) as unknown as OpenAIWhisperClient);
    this.model = options.model ?? 'whisper-1';
    this.now = options.now ?? (() => Date.now());
  }

  public async transcribe(options: Parameters<STTProviderPort['transcribe']>[0]): Promise<Awaited<ReturnType<STTProviderPort['transcribe']>>> {
    const startedAt = this.now();
    const result = await this.client.audio.transcriptions.create({
      model: this.model,
      file: createReadStream(options.audioPath),
      language: toWhisperLanguage(options.language)
    });

    return {
      transcript: result.text ?? '',
      confidence: 1,
      latencyMs: Math.max(0, this.now() - startedAt)
    };
  }
}
