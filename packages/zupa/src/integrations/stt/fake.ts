import { STTProviderPort } from "../../core/ports";

export class FakeSTTProvider implements STTProviderPort {
  public lastRequest: Parameters<STTProviderPort['transcribe']>[0] | null = null;

  public constructor(private readonly transcript: string = 'fake-transcript') {}

  public async transcribe(options: Parameters<STTProviderPort['transcribe']>[0]): Promise<ReturnType<STTProviderPort['transcribe']> extends Promise<infer T> ? T : never> {
    this.lastRequest = options;
    return {
      transcript: this.transcript,
      confidence: 1,
      latencyMs: 1
    };
  }
}
