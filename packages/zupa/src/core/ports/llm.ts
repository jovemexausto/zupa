import z from "zod";
import { ChatMessage } from "../domain/chat";
import { RuntimeResource } from "../runtime";
import { ToolCall, Tool } from "../../capabilities/tools/contracts";

export interface LLMCompleteOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  outputSchema?: z.ZodType;
  tools?: Tool[];
}

export interface LLMResponse {
  content: string | null;
  // TODO: can we infer this structured type ?
  structured: unknown | null;
  toolCalls: ToolCall[];
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
  };
  model: string;
  latencyMs: number;
}

export interface LLMProviderPort extends RuntimeResource {
  complete(options: LLMCompleteOptions): Promise<LLMResponse>;
}