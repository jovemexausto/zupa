import { type RuntimeResource } from '../lifecycle';

export interface TTSProvider extends RuntimeResource {
  synthesize(options: {
    text: string;
    voice?: string;
    outputPath: string;
    language: string;
  }): Promise<{
    audioPath: string;
    durationSeconds: number;
    latencyMs: number;
  }>;
}