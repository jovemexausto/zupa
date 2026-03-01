import {
  type RuntimeEngineResources,
  type RuntimeConfig,
  type MessagingTransport,
  resolveLanguage,
} from "@zupa/core";
import { AgentRuntime, buildDefaultNodeHandlers, type AgentRuntimeEvents } from "@zupa/runtime";
import { PinoLogger } from "@zupa/adapters";
import { createLocalResources } from "./resources";
import { LOGGING_DEFAULTS, ModalitySchema, ReplySchema, withReply } from "@zupa/core";

export { ModalitySchema, ReplySchema, withReply };

export type WithReply = {
  reply: string;
  modality?: 'text' | 'voice';
};

export type AgentProvidersConfig<TAuthPayload = unknown> = Partial<Omit<RuntimeEngineResources, 'transport'>> & {
  transport?: MessagingTransport<TAuthPayload>;
};

/**
 * Utility type to extract the TAuthPayload from an AgentProvidersConfig.
 * This is what allows TypeScript to infer TAuthPayload from the transport instance
 * passed in providers without requiring an explicit type annotation.
 */
export type InferAuthPayload<TProviders extends AgentProvidersConfig<unknown>> =
  TProviders extends AgentProvidersConfig<infer P> ? P : unknown;

/**
 * AgentConfig extends RuntimeConfig with additional public API options.
 * The main difference is that `language` and `ui` are optional here,
 * with sensible defaults applied in resolveRuntimeConfig.
 *
 * TAuthPayload is inferred from providers.transport via InferAuthPayload.
 */
export type AgentConfig<T extends WithReply = WithReply, TAuthPayload = unknown> = Omit<
  RuntimeConfig<T>,
  "language" | "ui"
> & {
  language?: string;
  ui?: false | RuntimeConfig<T>["ui"];
  providers?: AgentProvidersConfig<TAuthPayload>;
};

export function createAgent<T extends WithReply, TProviders extends AgentProvidersConfig<unknown> = AgentProvidersConfig<unknown>>(
  config: Omit<AgentConfig<T, InferAuthPayload<TProviders>>, 'providers'> & { providers?: TProviders }
) {
  type TAuthPayload = InferAuthPayload<TProviders>;
  let runtime: AgentRuntime<T, TAuthPayload> | null = null;
  const preStartListeners: Array<{
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];

  const ensureRuntime = async (): Promise<AgentRuntime<T, TAuthPayload>> => {
    if (runtime) return runtime;

    const runtimeConfig = await resolveRuntimeConfig<T>(config);
    validateRuntimeConfig<T>(runtimeConfig);

    const resources = applyDefaultProviders<TAuthPayload>((config.providers ?? {}) as AgentProvidersConfig<TAuthPayload>);

    runtime = new AgentRuntime<T, TAuthPayload>({
      runtimeConfig,
      runtimeResources: resources,
      handlers: buildDefaultNodeHandlers<T>(),
    });

    for (const listener of preStartListeners) {
      runtime.on(listener.event, listener.handler);
    }

    return runtime;
  };

  /**
   * Typed event subscription. For known events, handler args are fully typed.
   * Accepts `string` as a fallback for custom/unforeseen events.
   */
  function on<K extends keyof AgentRuntimeEvents<TAuthPayload>>(
    event: K,
    handler: AgentRuntimeEvents<TAuthPayload>[K],
  ): typeof agent;
  function on(event: string, handler: (...args: unknown[]) => void): typeof agent;
  function on(event: string, handler: (...args: unknown[]) => void): typeof agent {
    if (runtime) {
      runtime.on(event, handler);
    } else {
      preStartListeners.push({ event, handler });
    }
    return agent;
  }

  const agent = {
    start,
    stop,
    close,
    on,
  };

  async function start(): Promise<void> {
    await (await ensureRuntime()).start();
  }

  async function stop(): Promise<void> {
    if (!runtime) return;
    await runtime.close();
  }

  async function close(): Promise<void> {
    return stop();
  }

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

function applyDefaultProviders<TAuthPayload = unknown>(
  resources: AgentProvidersConfig<TAuthPayload>,
): RuntimeEngineResources<TAuthPayload> {
  const defaults = createLocalResources();
  return {
    transport: (resources.transport ?? defaults.transport) as MessagingTransport<TAuthPayload>,
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
