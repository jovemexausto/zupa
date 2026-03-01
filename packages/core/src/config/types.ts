import type { ZodType } from "zod";
import { AgentLanguage } from "../entities/agent";
import { AgentContext } from "../contracts/engine";
import { Tool } from "../contracts/modules";
import { CommandDefinition } from "../contracts/modules";

export type Modality = 'text' | 'voice' | 'auto';

export type DynamicModalityExtractor<T = any> = (
  state: any,
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
  sessionIdleTimeoutMinutes?: number;
  toolTimeoutMs?: number;
  llmTimeoutMs?: number;
  sttTimeoutMs?: number;
  ttsTimeoutMs?: number;
  ttsVoice?: string;
  welcomeMessage?: string;
  fallbackReply?: string;
  preferredVoiceReply?: boolean;
  ui?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    authToken?: string | undefined;
    corsOrigin?: string | string[] | undefined;
    sseHeartbeatMs?: number;
  };
}
