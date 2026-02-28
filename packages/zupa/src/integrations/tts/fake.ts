import { TTSProviderPort } from "../../core/ports";


export class FakeTTSProvider implements TTSProviderPort {
  public lastRequest: Parameters<TTSProviderPort['synthesize']>[0] | null = null;

  public async synthesize(options: Parameters<TTSProviderPort['synthesize']>[0]): Promise<ReturnType<TTSProviderPort['synthesize']> extends Promise<infer T> ? T : never> {
    this.lastRequest = options;
    return {
      audioPath: options.outputPath,
      durationSeconds: 1,
      latencyMs: 1
    };
  }
}
