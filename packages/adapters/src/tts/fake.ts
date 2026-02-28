import { type TTSProvider } from '@zupa/core';

export class FakeTTSProvider implements TTSProvider {
    public lastRequest?: { text: string; voice?: string; outputPath?: string; language?: string };

    public async synthesize(options: {
        text: string;
        voice: string;
        outputPath: string;
        language: string;
    }): Promise<{
        audioPath: string;
        durationSeconds: number;
        latencyMs: number;
    }> {
        this.lastRequest = options;
        return {
            audioPath: options.outputPath,
            durationSeconds: 1,
            latencyMs: 10
        };
    }
}
