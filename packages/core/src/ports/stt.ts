import { type RuntimeResource } from '../lifecycle';

export interface STTProvider extends RuntimeResource {
  transcribe(options: {
    audioPath: string;
    language: string;
  }): Promise<{
    transcript: string;
    confidence: number;
    latencyMs: number;
  }>;
}