import { AgentLanguage } from "../domain/agent";
import type { AgentContext } from "../domain/agent";
import type { Tool } from "../../capabilities/tools/contracts";
import type { CommandDefinition } from "../../capabilities/commands/contracts";
import type { ZodType } from "zod";

export interface RuntimeResource {
  start?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RuntimeConfig {
  prompt: string | ((ctx: AgentContext) => string | Promise<string>);
  singleUser?: string; // must match externalUserId
  language: AgentLanguage;
  outputSchema?: ZodType;
  tools?: Tool[];
  commands?: Record<string, false | CommandDefinition>;
  context?: (ctx: AgentContext) => Promise<Record<string, unknown>>;
  onResponse?: (structured: unknown, ctx: AgentContext) => Promise<void>;
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
  audioStoragePath?: string;
  welcomeMessage?: string;
  fallbackReply?: string;
  ui?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    authToken?: string;
    corsOrigin?: string | string[];
    sseHeartbeatMs?: number;
  };
}
