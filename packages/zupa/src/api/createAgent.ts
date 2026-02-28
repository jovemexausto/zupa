import {
  type RuntimeEngineResources,
  type RuntimeConfig,
  resolveLanguage,
} from "@zupa/core";
import { AgentRuntime, buildDefaultNodeHandlers } from "@zupa/runtime";
import { PinoLogger } from "@zupa/adapters";
import { createLocalResources } from "./resources";

type WithReply = { reply: string };

export type AgentProvidersConfig = Partial<RuntimeEngineResources>;

/**
 * AgentConfig extends RuntimeConfig with additional public API options.
 * The main difference is that `language` and `ui` are optional here,
 * with sensible defaults applied in resolveRuntimeConfig.
 */
export type AgentConfig<T extends WithReply = WithReply> = Omit<
  RuntimeConfig<T>,
  "language" | "ui"
> & {
  language?: string;
  ui?: false | RuntimeConfig<T>["ui"];
  providers?: AgentProvidersConfig;
};

export function createAgent<T extends WithReply>(config: AgentConfig<T>) {
  let runtime: AgentRuntime<T> | null = null;
  const preStartListeners: Array<{
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];

  const ensureRuntime = (): AgentRuntime<T> => {
    if (runtime) return runtime;

    const runtimeConfig = resolveRuntimeConfig<T>(config);
    validateRuntimeConfig<T>(runtimeConfig);

    const resources = applyDefaultProviders(config.providers || {});

    runtime = new AgentRuntime<T>({
      runtimeConfig,
      runtimeResources: resources,
      handlers: buildDefaultNodeHandlers<T>(),
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
    },
  };

  return agent;
}

function resolveRuntimeConfig<T extends WithReply>(
  config: AgentConfig<T>,
): RuntimeConfig<T> {
  const language = resolveLanguage(config.language);

  // Build RuntimeConfig from AgentConfig, excluding the providers field
  // which is specific to the wrapper API
  const { providers, ...runtimeConfigFields } = config as any;

  const resolved: RuntimeConfig<T> = {
    ...runtimeConfigFields,
    language,
  };

  // Apply UI defaults if not explicitly provided
  if (config.ui === false) {
    resolved.ui = { enabled: false };
  } else if (!config.ui) {
    resolved.ui = {
      enabled: true,
      host: "127.0.0.1",
      port: 5557,
      sseHeartbeatMs: 15_000,
    };
  } else {
    // Fill in any missing UI properties with defaults
    resolved.ui = {
      enabled: config.ui.enabled ?? true,
      host: config.ui.host ?? "127.0.0.1",
      port: config.ui.port ?? 5557,
      sseHeartbeatMs: config.ui.sseHeartbeatMs ?? 15_000,
      authToken: config.ui.authToken,
      corsOrigin: config.ui.corsOrigin,
    };
  }

  return resolved;
}

function validateRuntimeConfig<T>(_config: RuntimeConfig<T>): void {
  const prompt = _config.prompt;
  if (typeof prompt === "string" && !prompt.trim()) {
    throw new Error("Invalid agent config: missing prompt");
  }
}

function applyDefaultProviders(
  resources: AgentProvidersConfig,
): RuntimeEngineResources {
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
    logger:
      resources.logger ??
      new PinoLogger({
        level: "info",
        prettyPrint: process.env.NODE_ENV !== "production",
      }),
  };
}
