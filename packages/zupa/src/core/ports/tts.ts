import { AgentLanguage } from "../domain/agent";
import { RuntimeResource } from "../runtime";

export interface TTSProviderPort extends RuntimeResource {
  synthesize(options: {
    text: string;
    voice?: string;
    outputPath: string;
    language: AgentLanguage;
  }): Promise<{
    audioPath: string;
    durationSeconds: number;
    latencyMs: number;
  }>;
}