import { type RuntimeResource } from '../lifecycle';

export interface TTSProvider extends RuntimeResource {
  synthesize(options: {
    text: string;
    voice?: string;
    language: string;
  }): Promise<{
    audio: Buffer;
    format: string;
    durationSeconds: number;
    latencyMs: number;
  }>;
}