import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import { type STTProviderPort } from '@zupa/core';

export interface OpenAIWhisperSTTProviderOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    client?: OpenAI;
}

export class OpenAIWhisperSTTProvider implements STTProviderPort {
    private readonly client: OpenAI;
    private readonly model: string;

    public constructor(options: OpenAIWhisperSTTProviderOptions) {
        this.client = options.client ?? new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseUrl
        });
        this.model = options.model ?? 'whisper-1';
    }

    public async transcribe(options: {
        audioPath: string;
        language: string;
    }): Promise<{
        transcript: string;
        confidence: number;
        latencyMs: number;
    }> {
        const startedAt = Date.now();
        const result = await this.client.audio.transcriptions.create({
            model: this.model,
            file: createReadStream(options.audioPath),
            language: options.language
        });

        return {
            transcript: result.text ?? '',
            confidence: 1,
            latencyMs: Math.max(0, Date.now() - startedAt)
        };
    }
}
