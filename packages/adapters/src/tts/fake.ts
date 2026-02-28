import { type TTSProvider } from '@zupa/core';

export class FakeTTSProvider implements TTSProvider {
    public lastRequest?: { text: string; voice?: string; language?: string };

    public async synthesize(options: {
        text: string;
        voice: string;
        language: string;
    }): Promise<{
        audio: Buffer;
        format: string;
        durationSeconds: number;
        latencyMs: number;
    }> {
        this.lastRequest = options;
        return {
            audio: Buffer.from('fake-audio-bytes'),
            format: 'audio/ogg',
            durationSeconds: 1,
            latencyMs: 10
        };
    }
}
