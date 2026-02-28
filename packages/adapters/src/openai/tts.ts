import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { type TTSProvider } from '@zupa/core';

export interface OpenAITTSProviderOptions {
    apiKey: string;
    voice?: string;
    baseUrl?: string;
    model?: string;
    client?: OpenAI;
}

export class OpenAITTSProvider implements TTSProvider {
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly voice: string;

    public constructor(options: OpenAITTSProviderOptions) {
        this.client = options.client ?? new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseUrl
        });
        this.model = options.model ?? 'gpt-4o-mini-tts';
        this.voice = options.voice ?? 'alloy';
    }

    public async synthesize(options: {
        text: string;
        voice?: string;
        outputPath: string;
        language: string;
    }): Promise<{
        audioPath: string;
        durationSeconds: number;
        latencyMs: number;
    }> {
        const startedAt = Date.now();
        await mkdir(path.dirname(options.outputPath), { recursive: true });

        const response = await this.client.audio.speech.create({
            model: this.model,
            voice: (options.voice || this.voice) as OpenAI.Audio.SpeechCreateParams['voice'],
            input: options.text
        });

        const audio = Buffer.from(await response.arrayBuffer());
        await writeFile(options.outputPath, audio);

        return {
            audioPath: options.outputPath,
            durationSeconds: 0,
            latencyMs: Math.max(0, Date.now() - startedAt)
        };
    }
}
