import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import OpenAI from 'openai';

import type { TTSProviderPort } from '../../core/ports';

export interface OpenAITTSClient {
  audio: {
    speech: {
      create(input: Record<string, unknown>): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
}

export interface OpenAITTSProviderOptions {
  apiKey: string;
  voice?: string;
  baseUrl?: string;
  model?: string;
  client?: OpenAITTSClient;
  now?: () => number;
}

export class OpenAITTSProvider implements TTSProviderPort {
  private readonly client: OpenAITTSClient;
  private readonly model: string;
  private readonly now: () => number;
  private readonly voice: string;

  public constructor(options: OpenAITTSProviderOptions) {
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl
      }) as unknown as OpenAITTSClient);
    this.model = options.model ?? 'gpt-4o-mini-tts';
    this.voice = options.voice ?? 'alloy';
    this.now = options.now ?? (() => Date.now());
  }

  public async synthesize(options: Parameters<TTSProviderPort['synthesize']>[0]): Promise<Awaited<ReturnType<TTSProviderPort['synthesize']>>> {
    const startedAt = this.now();
    await mkdir(path.dirname(options.outputPath), { recursive: true });

    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: options.voice || this.voice,
      input: options.text
    });

    const audio = Buffer.from(await response.arrayBuffer());
    await writeFile(options.outputPath, audio);

    return {
      audioPath: options.outputPath,
      durationSeconds: 0,
      latencyMs: Math.max(0, this.now() - startedAt)
    };
  }
}
