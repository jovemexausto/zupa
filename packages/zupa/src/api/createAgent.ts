import { z } from 'zod';

import type { Tool } from '../capabilities/tools/contracts';
import type { AgentContext, AgentLanguage } from '../core/domain';
import { resolveLanguage } from '../core/utils/language';
import { buildDefaultKernelHandlers } from '../core/kernel/phases';
import { RuntimeKernelResources } from '../core/kernel';
import { AgentRuntime, RuntimeConfig } from '../core/runtime';
import { CommandDefinition } from '../capabilities/commands/contracts';
import { createLocalIntegrations } from '../integrations';

type WithReply = { reply: string };

export type AgentProvidersConfig = Partial<RuntimeKernelResources>

export interface AgentConfig<T extends WithReply = WithReply> {
  prompt                    : string | ((ctx: AgentContext) => string | Promise<string>);
  singleUser?               : string;
  language?                 : string;
  maxToolIterations?        : number;
  maxWorkingMemory?         : number;
  maxEpisodicMemory?        : number;
  semanticSearchLimit?      : number;
  rateLimitPerUserPerMinute?: number;
  maxIdempotentRetries?     : number;
  retryBaseDelayMs?         : number;
  retryJitterMs?            : number;
  maxInboundConcurrency?    : number;
  overloadMessage?          : string;
  sessionIdleTimeoutMinutes?: number;
  toolTimeoutMs?            : number;
  llmTimeoutMs?             : number;
  sttTimeoutMs?             : number;
  ttsTimeoutMs?             : number;
  ttsVoice?                 : string;
  audioStoragePath?         : string;
  welcomeMessage?           : string;
  fallbackReply?            : string;
  ui?                       : false | {
    enabled?      : boolean;
    host?         : string;
    port?         : number;
    authToken?    : string;
    corsOrigin?   : string | string[];
    sseHeartbeatMs?: number;
  };
  outputSchema?             : z.ZodType<T>;
  tools?                    : Tool[];
  commands?                 : Record<string, false | CommandDefinition>;
  context?                  : (ctx: AgentContext) => Promise<Record<string, unknown>>;
  onResponse?               : (structured: T, ctx: AgentContext) => Promise<void>;
  providers?                : AgentProvidersConfig
}

export function createAgent<T extends WithReply>(config: AgentConfig<T>) {
  let runtime: AgentRuntime | null = null;
  const preStartListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  const ensureRuntime = (): AgentRuntime => {
    if (runtime) return runtime;

    const runtimeConfig = resolveRuntimeConfig(config);
    validateRuntimeConfig(runtimeConfig);
    //
    const runtimeResources = validateRuntimeResources(
      applyDefaultProviders(config.providers || {})
    );

    runtime = new AgentRuntime({
      runtimeConfig, runtimeResources,
      handlers: buildDefaultKernelHandlers()
    });

    for (const listener of preStartListeners) {
      runtime.on(listener.event, listener.handler);
    }

    return runtime;
  };

  return {
    async start(): Promise<void> {
      await ensureRuntime().start();
    },

    async close(): Promise<void> {
      if  (!runtime) return;
      await runtime.close();
    },

    on(event: 'auth:qr' | 'auth:ready' | string, handler: (...args: unknown[]) => void) {
      if (runtime) {
        runtime.on(event, handler);
      } else {
        preStartListeners.push({ event, handler });
      }
      return this;
    }
  };
}

function resolveRuntimeConfig<T extends WithReply>(config: AgentConfig<T>): RuntimeConfig {
  let language: AgentLanguage;
  try {
    language = resolveLanguage(config.language);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message.replace('Invalid runtime config', 'Invalid agent config'));
    }

    throw error;
  }

  const resolved: RuntimeConfig = {
    language, prompt          : config.prompt,
    maxToolIterations         : config.maxToolIterations         ?? 3,
    maxWorkingMemory          : config.maxWorkingMemory          ?? 20,
    maxEpisodicMemory         : config.maxEpisodicMemory         ?? 3,
    semanticSearchLimit       : config.semanticSearchLimit       ?? 3,
    rateLimitPerUserPerMinute : config.rateLimitPerUserPerMinute ?? 20,
    maxIdempotentRetries      : config.maxIdempotentRetries      ?? 2,
    retryBaseDelayMs          : config.retryBaseDelayMs          ?? 75,
    retryJitterMs             : config.retryJitterMs             ?? 25,
    maxInboundConcurrency     : config.maxInboundConcurrency     ?? 32,
    overloadMessage           : config.overloadMessage           ?? 'System is busy right now. Please try again shortly.',
    sessionIdleTimeoutMinutes : config.sessionIdleTimeoutMinutes ?? 30,
    toolTimeoutMs             : config.toolTimeoutMs             ?? 12_000,
    llmTimeoutMs              : config.llmTimeoutMs              ?? 20_000,
    sttTimeoutMs              : config.sttTimeoutMs              ?? 15_000,
    ttsTimeoutMs              : config.ttsTimeoutMs              ?? 15_000,
    ttsVoice                  : config.ttsVoice                  ?? 'alloy',
    audioStoragePath          : config.audioStoragePath          ?? './data/audio',
    fallbackReply             : config.fallbackReply             ?? 'Sorry! I hit a temporary issue. Please try again in a moment.'
  };
  if (config.ui === false) {
    resolved.ui = { enabled: false };
  } else {
    const ui: NonNullable<RuntimeConfig['ui']> = {
      enabled: config.ui?.enabled ?? true,
      host: config.ui?.host ?? '127.0.0.1',
      port: config.ui?.port ?? 4200,
      sseHeartbeatMs: config.ui?.sseHeartbeatMs ?? 15_000
    };
    if (config.ui?.authToken !== undefined) {
      ui.authToken = config.ui.authToken;
    }
    if (config.ui?.corsOrigin !== undefined) {
      ui.corsOrigin = config.ui.corsOrigin;
    }
    resolved.ui = ui;
  }
  if (config.outputSchema !== undefined) {
    resolved.outputSchema = config.outputSchema;
  }
  if (config.tools !== undefined) {
    resolved.tools = config.tools;
  }
  if (config.commands !== undefined) {
    resolved.commands = config.commands;
  }
  if (config.context !== undefined) {
    resolved.context = config.context;
  }
  if (config.onResponse !== undefined) {
    const onResponse = config.onResponse;
    resolved.onResponse = async (structured, ctx) => {
      await onResponse(structured as T, ctx);
    };
  }

  if (config.singleUser !== undefined) {
    resolved.singleUser = config.singleUser;
  }
  if (config.welcomeMessage !== undefined) {
    resolved.welcomeMessage = config.welcomeMessage;
  }

  return resolved;
}

function validateRuntimeConfig(config: RuntimeConfig): void {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (typeof config.prompt === 'string' && !config.prompt.trim()) {
    missing.push('prompt');
  }
  if (typeof config.prompt !== 'string' && typeof config.prompt !== 'function') {
    missing.push('prompt');
  }

  const mustBePositiveInteger: Array<{ key: string; value: number | undefined }> = [
    { key: 'maxToolIterations',         value: config.maxToolIterations         },
    { key: 'maxWorkingMemory',          value: config.maxWorkingMemory          },
    { key: 'maxEpisodicMemory',         value: config.maxEpisodicMemory         },
    { key: 'semanticSearchLimit',       value: config.semanticSearchLimit       },
    { key: 'rateLimitPerUserPerMinute', value: config.rateLimitPerUserPerMinute },
    { key: 'retryBaseDelayMs',          value: config.retryBaseDelayMs          },
    { key: 'maxIdempotentRetries',      value: config.maxIdempotentRetries      },
    { key: 'maxInboundConcurrency',     value: config.maxInboundConcurrency     },
    { key: 'toolTimeoutMs',             value: config.toolTimeoutMs             },
    { key: 'llmTimeoutMs',              value: config.llmTimeoutMs              },
    { key: 'sttTimeoutMs',              value: config.sttTimeoutMs              },
    { key: 'ttsTimeoutMs',              value: config.ttsTimeoutMs              },
  ];

  for (const item of mustBePositiveInteger) {
    if (item.value === undefined) {
      missing.push(item.key);
      continue;
    }
    if (!Number.isInteger(item.value) || item.value <= 0) {
      invalid.push(item.key);
    }
  }

  const mustBeNonNegativeInteger: Array<{ key: string; value: number | undefined }> = [
    { key: 'retryJitterMs', value: config.retryJitterMs }
  ];
  for (const item of mustBeNonNegativeInteger) {
    if (item.value === undefined) {
      missing.push(item.key);
      continue;
    }
    if (!Number.isInteger(item.value) || item.value < 0) {
      invalid.push(item.key);
    }
  }

  if (!config.ttsVoice?.trim()) {
    missing.push('ttsVoice');
  }
  if (!config.audioStoragePath?.trim()) {
    missing.push('audioStoragePath');
  }
  if (!config.fallbackReply?.trim()) {
    missing.push('fallbackReply');
  }
  if (!config.overloadMessage?.trim()) {
    missing.push('overloadMessage');
  }
  if (
    config.sessionIdleTimeoutMinutes !== undefined
    && (!Number.isInteger(config.sessionIdleTimeoutMinutes) || config.sessionIdleTimeoutMinutes <= 0)
  ) {
    invalid.push('sessionIdleTimeoutMinutes');
  }
  if (config.ui && config.ui.enabled !== false) {
    if (config.ui.port === undefined) {
      missing.push('ui.port');
    } else if (!Number.isInteger(config.ui.port) || config.ui.port <= 0) {
      invalid.push('ui.port');
    }
    if (config.ui.sseHeartbeatMs === undefined) {
      missing.push('ui.sseHeartbeatMs');
    } else if (!Number.isInteger(config.ui.sseHeartbeatMs) || config.ui.sseHeartbeatMs <= 0) {
      invalid.push('ui.sseHeartbeatMs');
    }
    const host = config.ui?.host?.trim();
    if (!host) {
      missing.push('ui.host');
    } else if (!isLoopbackHost(host) && !config.ui?.authToken?.trim()) {
      throw new Error('Invalid agent config: ui.authToken is required for non-loopback ui.host');
    }
  }

  if (missing.length > 0) {
    throw new Error(`Invalid agent config: missing ${missing.join(', ')}`);
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid agent config: invalid ${invalid.join(', ')}`);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function validateRuntimeResources(resources: AgentProvidersConfig): RuntimeKernelResources {
  const missing: string[] = [];

  if (!resources.llm) {
    missing.push('resources.llm');
  }
  if (!resources.stt) {
    missing.push('resources.stt');
  }
  if (!resources.tts) {
    missing.push('resources.tts');
  }
  if (!resources.transport) {
    missing.push('transport');
  }
  if (!resources.storage) {
    missing.push('storage');
  }
  if (!resources.vectors) {
    missing.push('vectors');
  }
  if (!resources.database) {
    missing.push('database');
  }

  if (missing.length > 0) {
    throw new Error(`Invalid agent config: missing ${missing.join(', ')}`);
  }

  return resources as RuntimeKernelResources
}

function applyDefaultProviders(
  resources: AgentProvidersConfig,
): RuntimeKernelResources {
  const hasAllRequired =
    resources.llm       !== undefined &&
    resources.stt       !== undefined &&
    resources.tts       !== undefined &&
    resources.transport !== undefined &&
    resources.storage   !== undefined &&
    resources.vectors   !== undefined &&
    resources.database  !== undefined;

  if (hasAllRequired) {
    return resources as RuntimeKernelResources
  }

  const defaults = createLocalIntegrations();
  return {
    transport : resources.transport ?? defaults.transport,
    llm       : resources.llm       ?? defaults.llm,
    stt       : resources.stt       ?? defaults.stt,
    tts       : resources.tts       ?? defaults.tts,
    storage   : resources.storage   ?? defaults.storage,
    vectors   : resources.vectors   ?? defaults.vectors,
    database  : resources.database  ?? defaults.database,
    telemetry : resources.telemetry ?? defaults.telemetry,
  };
}

export const __private = {
  resolveRuntimeConfig,
  validateRuntimeConfig,
  validateRuntimeResources,
  buildDefaultKernelHandlers,
};

export type { WithReply };
