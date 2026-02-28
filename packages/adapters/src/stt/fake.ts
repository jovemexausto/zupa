import { type STTProviderPort } from '@zupa/core';

export class FakeSTTProvider implements STTProviderPort {
    public lastRequest?: { audioPath: string; language?: string };

    constructor(private readonly transcript: string = 'This is a fake transcript.') { }

    public async transcribe(options: { audioPath: string; language: string }): Promise<{
        transcript: string;
        confidence: number;
        latencyMs: number;
    }> {
        this.lastRequest = options;
        return {
            transcript: this.transcript,
            confidence: 1,
            latencyMs: 10
        };
    }
}
