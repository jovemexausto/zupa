import type { ZodType } from "zod";
import { AgentLanguage } from "../entities/agent";
import { AgentContext } from "../contracts/engine";
import { Tool } from "../contracts/modules";
import { CommandDefinition } from "../contracts/modules";

export type UiConfig = {
  host?: string;
  port?: number;
  enabled?: boolean;
  authToken?: string;
  corsOrigin?: string | string[];
  sseHeartbeatMs?: number;
};

export type Modality = 'text' | 'voice' | 'auto';

export type DynamicModalityExtractor<T = unknown> = (
  state: unknown,
  ctx: AgentContext<T>
) => 'text' | 'voice' | undefined;

export interface RuntimeConfig<T = unknown> {
  prompt: string | ((ctx: AgentContext<T>) => string | Promise<string>);
  singleUser?: string;
  language: AgentLanguage;
  outputSchema?: ZodType<T>;
  tools?: Tool[];
  commands?: Record<string, false | CommandDefinition>;
  context?: (ctx: AgentContext<T>) => Promise<Record<string, unknown>>;
  onResponse?: (structured: T, ctx: AgentContext<T>) => Promise<void>;
  modality?: Modality;
  dynamicModalityExtractor?: DynamicModalityExtractor<T>;
  maxToolIterations?: number;
  maxWorkingMemory?: number;
  maxEpisodicMemory?: number;
  semanticSearchLimit?: number;
  rateLimitPerUserPerMinute?: number;
  maxIdempotentRetries?: number;
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
  maxInboundConcurrency?: number;
  overloadMessage?: string;
  sessionIdleTimeoutMinutes: number;
  toolTimeoutMs?: number;
  llmTimeoutMs?: number;
  sttTimeoutMs?: number;
  ttsTimeoutMs?: number;
  ttsVoice?: string;
  welcomeMessage?: string;
  fallbackReply?: string;
  preferredVoiceReply?: boolean;
  ui?: false | UiConfig;
  /**
   * Defines whether to buffer the full LLM response before sending ('buffered')
   * or stream sub-word tokens as they are generated to a Reactive UI client ('streaming').
   * Note: 'streaming' automatically falls back to 'buffered' for voice interactions
   * or if the transport does not support streaming.
   * @default 'buffered'
   */
  finalizationStrategy?: 'streaming' | 'buffered';
}
