import {
  type RuntimeResourceSet,
  type RuntimeConfig,
  type MessagingTransport,
  resolveLanguage,
} from "@zupa/core";
import { AgentRuntime, buildDefaultNodeHandlers } from "@zupa/runtime";
import { createLocalResources } from "./resources";
import { withReply } from "@zupa/core";
import { PinoLogger, EventLoggerResource } from "@zupa/adapters";

export { withReply };

export type WithReply = {
  reply: string;
  modality?: "text" | "voice" | null;
};

export type AgentProvidersConfig = Partial<Omit<RuntimeResourceSet, "transport">> & {
  transport?: MessagingTransport<unknown>;
};

/**
 * AgentConfig extends RuntimeConfig with additional public API options.
 */
export type AgentConfig<T extends WithReply = WithReply> = Omit<
  RuntimeConfig<T>,
  "language" | "ui" | "sessionIdleTimeoutMinutes"
> & {
  language?: string;
  ui?: false | RuntimeConfig<T>["ui"];
  sessionIdleTimeoutMinutes?: number;
  providers?: AgentProvidersConfig;
};

export function createAgent<T extends WithReply>(config: AgentConfig<T>) {
  let runtime: AgentRuntime<T> | null = null;
  const defaultResources = applyDefaultProviders(config.providers ?? {});
  const bus = config.providers?.bus || defaultResources.bus;

  const ensureRuntime = async (): Promise<AgentRuntime<T>> => {
    if (runtime) return runtime;

    const runtimeConfig = await resolveRuntimeConfig<T>(config);
    validateRuntimeConfig<T>(runtimeConfig);

    const resources = { ...defaultResources };

    // Initialize autonomous logger if not provided
    if (!resources.logger) {
      const pino = new PinoLogger({
        prettyPrint: true,
        level: (runtimeConfig as any).logLevel || "info",
      });
      resources.logger = new EventLoggerResource(pino);
    }

    runtime = new AgentRuntime<T>({
      runtimeConfig,
      runtimeResources: resources,
      handlers: buildDefaultNodeHandlers<T>(),
    });

    return runtime;
  };

  const agent = {
    start,
    stop,
    close,
    bus,
    /**
     * Typesafe facade for the underlying ReducerEventBus.
     * Maps legacy event names (e.g. 'auth:request') to internal channels for backward compatibility.
     */
    on: <TPayload = unknown>(name: string, handler: (payload: TPayload) => void) => {
      // Compatibility mapping
      const busEventName =
        name === "auth:request"
          ? "transport:auth:request"
          : name === "auth:ready"
            ? "transport:auth:ready"
            : name;

      return bus.subscribe(busEventName, (event) => handler(event.payload as TPayload));
    },
    /**
     * Registers stateful middleware (Reducer) to the underlying bus.
     */
    use: (reducer: (event: any) => any) => {
      return bus.use(reducer);
    },
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

// TODO (deferred): this seems to not be doing much work, maybe it doesn't belong here
async function resolveRuntimeConfig<T extends WithReply>(
  config: AgentConfig<T>,
): Promise<RuntimeConfig<T>> {
  const language = resolveLanguage(config.language);

  // Strip providers (public API) to get pure RuntimeConfig fields
  // AgentConfig adds `language` as optional with a wider type and `providers`;
  // RuntimeConfig expects `language` as AgentLanguage — we resolve below.
  const {
    providers: _providers,
    language: _lang,
    ui,
    ...rest
  } = config as AgentConfig<T> & { providers?: unknown };

  const resolved: RuntimeConfig<T> = {
    ...rest,
    language,
    sessionIdleTimeoutMinutes: config.sessionIdleTimeoutMinutes ?? 15,
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

function applyDefaultProviders(resources: AgentProvidersConfig): RuntimeResourceSet {
  const defaults = createLocalResources();

  return {
    // AI Providers
    llm: resources.llm ?? defaults.llm,
    stt: resources.stt ?? defaults.stt,
    tts: resources.tts ?? defaults.tts,

    // Messaging Transport
    transport: resources.transport ?? defaults.transport,

    // Storage Providers
    storage: resources.storage ?? defaults.storage,
    vectors: resources.vectors ?? defaults.vectors,

    // Event Bus
    bus: resources.bus ?? defaults.bus,

    // Persistence Slots
    checkpointer: resources.checkpointer ?? defaults.checkpointer,
    ledger: resources.ledger ?? defaults.ledger,
    domainStore: resources.domainStore ?? defaults.domainStore,

    // UI Resources
    ...(resources.dashboard && { dashboard: resources.dashboard }),
    ...(resources.reactiveUi && { reactiveUi: resources.reactiveUi }),
  };
}
