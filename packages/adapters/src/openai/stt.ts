import OpenAI, { toFile } from 'openai';
import { type STTProvider } from '@zupa/core';

export interface OpenAIWhisperSTTProviderOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    client?: OpenAI;
}

export class OpenAIWhisperSTTProvider implements STTProvider {
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
        audio: Buffer;
        format: string;
        language: string;
    }): Promise<{
        transcript: string;
        confidence: number;
        latencyMs: number;
    }> {
        const startedAt = Date.now();
        const result = await this.client.audio.transcriptions.create({
            model: this.model,
            file: await toFile(options.audio, 'audio.ogg', { type: options.format }),
            language: options.language
        });

        return {
            transcript: result.text ?? '',
            confidence: 1,
            latencyMs: Math.max(0, Date.now() - startedAt)
        };
    }
}
