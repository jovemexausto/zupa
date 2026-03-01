import {
  type RuntimeEngineResources,
  type RuntimeConfig,
  type MessagingTransport,
  resolveLanguage,
} from "@zupa/core";
import { AgentRuntime, buildDefaultNodeHandlers } from "@zupa/runtime";
import { PinoLogger } from "@zupa/adapters";
import { createLocalResources } from "./resources";
import { LOGGING_DEFAULTS, ModalitySchema, ReplySchema, withReply } from "@zupa/core";

export { ModalitySchema, ReplySchema, withReply };

export type WithReply = {
  reply: string;
  modality?: 'text' | 'voice' | null;
};

export type AgentProvidersConfig = Partial<Omit<RuntimeEngineResources, 'transport'>> & {
  transport?: MessagingTransport<unknown>;
};

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
    handler: ((...args: unknown[]) => void) | ((arg: unknown) => void) | (() => void);
  }> = [];

  const ensureRuntime = async (): Promise<AgentRuntime<T>> => {
    if (runtime) return runtime;

    const runtimeConfig = await resolveRuntimeConfig<T>(config);
    validateRuntimeConfig<T>(runtimeConfig);

    const resources = applyDefaultProviders(config.providers ?? {});

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

  /**
   * Subscribes to runtime lifecycle and adapter events.
   *
   * For `'auth:request'`, specify the payload type from your transport:
   * ```ts
   * agent.on<WWebJSAuthPayload>('auth:request', (payload) => { ... });
   * ```
   */
  function on<TPayload = unknown>(event: 'auth:request', handler: (payload: TPayload) => void): typeof agent;
  function on(event: 'auth:ready', handler: () => void): typeof agent;
  function on(event: 'auth:failure', handler: (message: string) => void): typeof agent;
  function on(event: string, handler: (...args: unknown[]) => void): typeof agent;
  function on(event: string, handler: unknown): typeof agent {
    const normalized = handler as (...args: unknown[]) => void;
    if (runtime) {
      runtime.on(event, normalized);
    } else {
      preStartListeners.push({ event, handler: normalized });
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

// TODO: this seems to not be doing much work, maybe it doesn't belong here
async function resolveRuntimeConfig<T extends WithReply>(
  config: AgentConfig<T>,
): Promise<RuntimeConfig<T>> {
  const language = resolveLanguage(config.language);

  // Strip providers (public API) to get pure RuntimeConfig fields
  // AgentConfig adds `language` as optional with a wider type and `providers`;
  // RuntimeConfig expects `language` as AgentLanguage — we resolve below.
  const { providers: _providers, language: _lang, ui, ...rest } = config as AgentConfig<T> & { providers?: unknown };

  const resolved: RuntimeConfig<T> = {
    ...rest,
    language,
    ...(ui !== false && ui !== undefined && { ui }),
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
