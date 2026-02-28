import { AgentLanguage } from "../domain/agent";
import { RuntimeResource } from "../runtime";

export interface STTProviderPort extends RuntimeResource {
  transcribe(options: { audioPath: string; language: AgentLanguage }): Promise<{
    transcript : string;
    confidence : number;
    latencyMs  : number;
  }>;
}