import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import {
  RuntimeConfig,
  RuntimeResource,
  RuntimeEngineResources,
  RuntimeEngineContext,
  InboundMessage,
  normalizeExternalUserId,
} from "@zupa/core";

import { EngineExecutor, createInitialRuntimeContext } from "@zupa/engine";

import { buildEngineGraphSpec } from "./engine/graph";

import {
  bindTransportInbound,
  type TransportInboundBinding,
  bindTransportAuth,
} from "./inbound/transportBridge";
import {
  closeResources,
  collectLifecycleResources,
  startResources,
} from "./resources/lifecycle";
import {
  buildDefaultNodeHandlers,
  type RuntimeState,
  type RuntimeNodeHandlerMap,
} from "./nodes";
import { RuntimeUiServer } from "./ui/server";
import { resolveUiConfig } from "./ui/resolveUiConfig";

/**
 * Input configuration required to boot an AgentRuntime instance.
 */
export interface AgentRuntimeInput<T = unknown> {
  runtimeConfig: RuntimeConfig<T>;
  runtimeResources: RuntimeEngineResources;
  handlers?: RuntimeNodeHandlerMap<T>;
}

/**
 * Known Zupa runtime events emitted by AgentRuntime.
 * Use these as the `event` argument of `runtime.on(event, handler)`.
 */
export interface AgentRuntimeEvents {
  'auth:request': (payload: unknown) => void;
  'auth:ready': () => void;
  'auth:failure': (message: string) => void;
  'inbound:received': (data: { inbound: InboundMessage }) => void;
  'inbound:processed': (data: { requestId: string; from: string }) => void;
  'inbound:failed': (data: { requestId: string; error: string; inbound: InboundMessage }) => void;
  'inbound:overload': (data: { inbound: InboundMessage }) => void;
}

/**
 * The core coordination daemon for the Zupa Framework.
 *
 * AgentRuntime orchestrates the lifecycle of all adapters, binds the transport
 * for incoming and outgoing messages, starts the UI server if configured,
 * and maintains the execution layer (`EngineExecutor`) to process each request.
 */
export class AgentRuntime<T = unknown, TAuthPayload = unknown> {
  private readonly emitter = new EventEmitter();
  private readonly runtimeConfig: RuntimeConfig<T>;
  private readonly runtimeResources: RuntimeEngineResources;
  private readonly executor: EngineExecutor<
    RuntimeState,
    RuntimeEngineContext<T>
  >;
  private inboundBridge: TransportInboundBinding | null = null;
  private stopAuthBridge: (() => void) | null = null;
  private lifecycleResources: RuntimeResource[] = [];
  private uiServer: RuntimeUiServer | null = null;

  public constructor(input: AgentRuntimeInput<T>) {
    this.runtimeConfig = input.runtimeConfig;
    this.runtimeResources = input.runtimeResources;

    const handlers = input.handlers ?? buildDefaultNodeHandlers<T>();
    const graph = buildEngineGraphSpec<T>(handlers);
    this.executor = new EngineExecutor(graph);
    // UI server will be resolved asynchronously in start()
  }

  /**
   * Starts all underlying resources (adapters, graph engine, and UI server).
   * It also binds the inbound transport handler for message intake and concurrency.
   *
   * @throws Error if any adapter fails to start.
   */
  public async start(): Promise<void> {
    // Resolve UI config and start UI server if enabled
    const resolvedUi = await resolveUiConfig(this.runtimeConfig.ui);
    if (resolvedUi.enabled !== false) {
      this.uiServer = new RuntimeUiServer(resolvedUi);
      await this.uiServer.start();
    } else {
      this.uiServer = null;
    }
    this.runtimeResources.logger.info(
      {
        ui: !!this.uiServer,
        ...(this.uiServer && {
          url: `http://${this.uiServer.options.host}:${this.uiServer.options.port}`,
        }),
      },
      "Starting AgentRuntime.",
    );

    this.stopAuthBridge = bindTransportAuth({
      transport: this.runtimeResources.transport,
      onAuthRequest: (payload) => {
        this.uiServer?.setLatestQr(typeof payload === 'string' ? payload : JSON.stringify(payload));
        this.emitRuntimeEvent("auth:request", payload);
      },
      onAuthReady: () => {
        this.uiServer?.setOnlineStatus(true);
        this.emitRuntimeEvent("auth:ready", undefined);
      },
      onAuthFailure: (message) => {
        this.emitRuntimeEvent("auth:failure", message);
      },
    });
    this.lifecycleResources = collectLifecycleResources(this.runtimeResources);
    try {
      await startResources(this.lifecycleResources);
    } catch (error) {
      if (this.stopAuthBridge) {
        this.stopAuthBridge();
        this.stopAuthBridge = null;
      }
      if (this.uiServer) {
        await this.uiServer.close();
      }
      throw error;
    }

    this.inboundBridge = bindTransportInbound({
      transport: this.runtimeResources.transport,
      maxConcurrent: this.runtimeConfig.maxInboundConcurrency ?? 32,
      runInboundEngine: async (inbound) => {
        await this.runInbound(inbound);
      },
      onOverload: async (inbound) => {
        const message = this.runtimeConfig.overloadMessage?.trim();
        if (message) {
          await this.runtimeResources.transport.sendText(inbound.from, message);
        }
        this.emitRuntimeEvent("inbound:overload", { inbound });
      },
      onError: (error, inbound) => {
        this.emitRuntimeEvent("inbound:error", {
          error: String(error),
          inbound,
        });
      },
    });
  }

  /**
   * Stops all underlying resources gracefully, releasing memory and active ports.
   */
  public async close(): Promise<void> {
    this.runtimeResources.logger.info("Closing AgentRuntime");
    if (this.inboundBridge) {
      this.inboundBridge.stop();
      this.inboundBridge = null;
    }
    if (this.stopAuthBridge) {
      this.stopAuthBridge();
      this.stopAuthBridge = null;
    }

    await closeResources(this.lifecycleResources);
    this.lifecycleResources = [];
    if (this.uiServer) {
      await this.uiServer.close();
    }
  }

  /**
   * Subscribes to runtime lifecycle and adapter events.
   *
   * For `'auth:request'`, use the generic to type the payload from your transport:
   * ```ts
   * runtime.on<WWebJSAuthPayload>('auth:request', (payload) => { ... });
   * ```
   */
  public on<TPayload = unknown>(event: 'auth:request', handler: (payload: TPayload) => void): this;
  public on(event: 'auth:ready', handler: () => void): this;
  public on(event: 'auth:failure', handler: (message: string) => void): this;
  public on(event: string, handler: (...args: unknown[]) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: string, handler: (...args: any[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  /**
   * Invokes the execution graph manually for a specific inbound message.
   * Normally used for testing or advanced scenarios, as `start()` automatically
   * binds logic to consume transport messages.
   */
  public async runInbound(
    inbound: InboundMessage,
  ): Promise<RuntimeEngineContext<T>> {
    const requestId = randomUUID();
    const logger = this.runtimeResources.logger.child({ requestId });

    logger.info({ inbound }, "Inbound message received");
    this.emitRuntimeEvent("inbound:received", { inbound });

    const startedAt = new Date();

    const context = createInitialRuntimeContext<T>({
      requestId,
      startedAt,
      runtimeConfig: this.runtimeConfig,
      runtimeResources: this.runtimeResources,
      inbound,
    });

    const saver = this.runtimeResources.database;
    // Resolve session identity before graph execution to establish consistent threadId
    const inboundFrom = inbound.from;
    const inboundExternalUserId = normalizeExternalUserId(inboundFrom);

    let user = await this.runtimeResources.database.findUser(inboundExternalUserId);
    if (!user) {
      user = await this.runtimeResources.database.createUser({
        externalUserId: inboundExternalUserId,
        displayName: inboundFrom.split(':')[0] || 'Unknown User'
      });
    }

    let session = await this.runtimeResources.database.findActiveSession(user.id);
    if (!session) {
      session = await this.runtimeResources.database.createSession(user.id);
    }

    // Crucially, we put the resolved user and session into the initial state
    // so that nodes like content_resolution can access them immediately.
    context.state = {
      ...context.state,
      user,
      session,
      inbound
    };

    const threadId = session.id;

    try {
      await this.executor.invoke(context.state, context, {
        threadId,
        saver,
        entrypoint: "turn_setup",
      });

      logger.info({ from: inbound.from }, "Inbound message processed");
      this.emitRuntimeEvent("inbound:processed", {
        requestId,
        from: inbound.from,
      });
    } catch (error) {
      logger.error({ error: String(error), inbound }, "Inbound message failed");
      this.emitRuntimeEvent("inbound:failed", {
        requestId,
        error: String(error),
        inbound,
      });
      throw error;
    }

    return context;
  }

  private emitRuntimeEvent(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
    this.uiServer?.publish(event, payload);
  }
}
