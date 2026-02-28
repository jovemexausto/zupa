import { z } from 'zod';
import {
  type AgentContext,
  type RuntimeKernelResources,
  type Tool,
  type CommandDefinition,
  resolveLanguage
} from '@zupa/core';
import {
  AgentRuntime,
  type RuntimeConfig,
  buildDefaultNodeHandlers
} from '@zupa/runtime';
import { createLocalResources } from './resources';

type WithReply = { reply: string };

export type AgentProvidersConfig = Partial<RuntimeKernelResources>;

export interface AgentUIConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  authToken?: string | undefined;
  corsOrigin?: string | string[] | undefined;
  sseHeartbeatMs?: number;
}

export interface AgentConfig<T extends WithReply = WithReply> {
  prompt: string | ((ctx: AgentContext<T>) => string | Promise<string>);
  singleUser?: string;
  language?: string;
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
  preferredVoiceReply?: boolean;
  ui?: false | AgentUIConfig;
  outputSchema?: z.ZodType<T>;
  tools?: Tool[];
  commands?: Record<string, false | CommandDefinition>;
  context?: (ctx: AgentContext<T>) => Promise<Record<string, unknown>>;
  onResponse?: (structured: T, ctx: AgentContext<T>) => Promise<void>;
  providers?: AgentProvidersConfig;
}

export function createAgent<T extends WithReply>(config: AgentConfig<T>) {
  let runtime: AgentRuntime<T> | null = null;
  const preStartListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  const ensureRuntime = (): AgentRuntime<T> => {
    if (runtime) return runtime;

    const runtimeConfig = resolveRuntimeConfig<T>(config);
    validateRuntimeConfig<T>(runtimeConfig);

    const resources = applyDefaultProviders(config.providers || {});

    runtime = new AgentRuntime<T>({
      runtimeConfig,
      runtimeResources: resources,
      handlers: buildDefaultNodeHandlers<T>()
    });

    for (const listener of preStartListeners) {
      runtime.on(listener.event, listener.handler);
    }

    return runtime;
  };

  const agent = {
    async start(): Promise<void> {
      await ensureRuntime().start();
    },

    async stop(): Promise<void> {
      if (!runtime) return;
      await runtime.close();
    },

    async close(): Promise<void> {
      return this.stop();
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      if (runtime) {
        runtime.on(event, handler);
      } else {
        preStartListeners.push({ event, handler });
      }
      return this;
    }
  };

  return agent;
}

function resolveRuntimeConfig<T extends WithReply>(config: AgentConfig<T>): RuntimeConfig<T> {
  const language = resolveLanguage(config.language);

  const resolved: RuntimeConfig<T> = {
    language,
    prompt: config.prompt,
    maxToolIterations: config.maxToolIterations ?? 3,
    maxWorkingMemory: config.maxWorkingMemory ?? 20,
    maxEpisodicMemory: config.maxEpisodicMemory ?? 3,
    semanticSearchLimit: config.semanticSearchLimit ?? 3,
    rateLimitPerUserPerMinute: config.rateLimitPerUserPerMinute ?? 20,
    maxIdempotentRetries: config.maxIdempotentRetries ?? 2,
    retryBaseDelayMs: config.retryBaseDelayMs ?? 75,
    retryJitterMs: config.retryJitterMs ?? 25,
    maxInboundConcurrency: config.maxInboundConcurrency ?? 32,
    overloadMessage: config.overloadMessage ?? 'System is busy right now. Please try again shortly.',
    sessionIdleTimeoutMinutes: config.sessionIdleTimeoutMinutes ?? 30,
    toolTimeoutMs: config.toolTimeoutMs ?? 12_000,
    llmTimeoutMs: config.llmTimeoutMs ?? 20_000,
    sttTimeoutMs: config.sttTimeoutMs ?? 15_000,
    ttsTimeoutMs: config.ttsTimeoutMs ?? 15_000,
    ttsVoice: config.ttsVoice ?? 'alloy',
    audioStoragePath: config.audioStoragePath ?? './data/audio',
    fallbackReply: config.fallbackReply ?? 'Sorry! I hit a temporary issue. Please try again in a moment.',
    preferredVoiceReply: config.preferredVoiceReply ?? false
  };

  if (config.ui === false) {
    resolved.ui = { enabled: false };
  } else {
    resolved.ui = {
      enabled: config.ui?.enabled ?? true,
      host: config.ui?.host ?? '127.0.0.1',
      port: config.ui?.port ?? 5557,
      sseHeartbeatMs: config.ui?.sseHeartbeatMs ?? 15_000,
      authToken: config.ui?.authToken ?? undefined,
      corsOrigin: config.ui?.corsOrigin ?? undefined
    };
  }

  if (config.outputSchema) resolved.outputSchema = config.outputSchema;
  if (config.tools) resolved.tools = config.tools;
  if (config.commands) resolved.commands = config.commands;
  if (config.context) resolved.context = config.context;
  if (config.onResponse) resolved.onResponse = config.onResponse;
  if (config.singleUser) resolved.singleUser = config.singleUser;
  if (config.welcomeMessage) resolved.welcomeMessage = config.welcomeMessage;

  return resolved;
}

function validateRuntimeConfig<T>(_config: RuntimeConfig<T>): void {
  const prompt = _config.prompt;
  if (typeof prompt === 'string' && !prompt.trim()) {
    throw new Error('Invalid agent config: missing prompt');
  }
}

function applyDefaultProviders(resources: AgentProvidersConfig): RuntimeKernelResources {
  const defaults = createLocalResources();
  return {
    transport: resources.transport ?? defaults.transport,
    llm: resources.llm ?? defaults.llm,
    stt: resources.stt ?? defaults.stt,
    tts: resources.tts ?? defaults.tts,
    storage: resources.storage ?? defaults.storage,
    vectors: resources.vectors ?? defaults.vectors,
    database: resources.database ?? defaults.database,
    telemetry: resources.telemetry ?? defaults.telemetry,
  };
}
