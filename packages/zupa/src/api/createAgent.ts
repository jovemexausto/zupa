import {
  type RuntimeEngineResources,
  type RuntimeConfig,
  resolveLanguage,
} from "@zupa/core";
import { AgentRuntime, buildDefaultNodeHandlers } from "@zupa/runtime";
import { PinoLogger } from "@zupa/adapters";
import { createLocalResources } from "./resources";
import { LOGGING_DEFAULTS, ModalitySchema, ReplySchema, withReply } from "@zupa/core";

export { ModalitySchema, ReplySchema, withReply };

export type WithReply = {
  reply: string;
  modality?: 'text' | 'voice';
};

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

  const ensureRuntime = async (): Promise<AgentRuntime<T>> => {
    if (runtime) return runtime;

    const runtimeConfig = await resolveRuntimeConfig<T>(config);
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
      await (await ensureRuntime()).start();
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

// TODO: this seems to not be doing much work
async function resolveRuntimeConfig<T extends WithReply>(
  config: AgentConfig<T>,
): Promise<RuntimeConfig<T>> {
  const language = resolveLanguage(config.language);

  // Build RuntimeConfig from AgentConfig, excluding the providers field
  // which is specific to the wrapper API
  const { providers, ...runtimeConfigFields } = config as any;

  // Proxy UI config directly; do not resolve here
  const resolved: RuntimeConfig<T> = {
    ...runtimeConfigFields,
    language,
    ui: config.ui,
  };

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
        level: LOGGING_DEFAULTS.LEVEL,
        prettyPrint: LOGGING_DEFAULTS.PRETTY_PRINT,
      }),
  };
}
