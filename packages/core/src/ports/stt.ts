import { type RuntimeResource } from '../lifecycle';

export interface STTProviderPort extends RuntimeResource {
  transcribe(options: {
    audioPath: string;
    language: string;
  }): Promise<{
    transcript: string;
    confidence: number;
    latencyMs: number;
  }>;
}