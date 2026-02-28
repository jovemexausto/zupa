import { z } from 'zod';
import { type ChatMessage, type Tool, type ToolCall } from '../contracts/modules';
import { type RuntimeResource } from '../lifecycle';

export interface LLMCompleteOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  outputSchema?: z.ZodType | undefined;
  tools?: Tool[] | undefined;
}

export interface LLMResponse {
  content: string | null;
  structured: unknown | null;
  toolCalls: ToolCall[];
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
  };
  model: string;
  latencyMs: number;
}

export interface LLMProvider extends RuntimeResource {
  complete(options: LLMCompleteOptions): Promise<LLMResponse>;
}