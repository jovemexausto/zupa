import { type RuntimeResource } from '../lifecycle';

export interface STTProvider extends RuntimeResource {
  transcribe(options: {
    audio: Buffer;
    format: string;
    language: string;
  }): Promise<{
    transcript: string;
    confidence: number;
    latencyMs: number;
  }>;
}