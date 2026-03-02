import { randomUUID } from "node:crypto";

import {
  RuntimeConfig,
  RuntimeResourceContext,
  RuntimeResourceSet,
  RuntimeEngineContext,
  RouterState,
  InboundMessage,
  Logger,
} from "@zupa/core";

import { EngineExecutor, createInitialRuntimeContext } from "@zupa/engine";
import { MemoryCheckpointer } from "@zupa/adapters";

import { buildEngineGraphSpec } from "./engine/graph";
import { createEventBusLogger } from "./bus/logger";
import { createInboundConcurrencyLimiter } from "./bus/InboundConcurrencyLimiter";

import {
  closeResources,
  collectLifecycleResources,
  startResources,
  type AnyResource,
} from "./resources/lifecycle";
import { buildDefaultNodeHandlers, type RuntimeState, type RuntimeNodeHandlerMap } from "./nodes";
import { buildRouterGraphSpec } from "./nodes/router";

/**
 * Input configuration required to boot an AgentRuntime instance.
 */
export interface AgentRuntimeInput<T = unknown> {
  runtimeConfig: RuntimeConfig<T>;
  runtimeResources: RuntimeResourceSet;
  handlers?: RuntimeNodeHandlerMap<T>;
}

/**
 * The core coordination daemon for the Zupa Framework.
 *
 * AgentRuntime orchestrates the lifecycle of all adapters, binds the transport
 * for incoming and outgoing messages, starts the UI server if configured,
 * and maintains the execution layer (`EngineExecutor`) to process each request.
 */
export class AgentRuntime<T = unknown> {
  private readonly runtimeConfig: RuntimeConfig<T>;
  private readonly runtimeResources: RuntimeResourceSet;
  private readonly executor: EngineExecutor<RuntimeState, RuntimeEngineContext<T>>;
  private readonly routerExecutor: EngineExecutor<RouterState, RuntimeEngineContext<T>>;
  private readonly routerSaver: MemoryCheckpointer<RouterState>;
  private lifecycleResources: AnyResource[] = [];
  private isClosing = false;
  private readonly logger: Logger;

  private handleShutdown = async (): Promise<void> => {
    try {
      this.logger.info("Received termination signal, shutting down gracefully...");
      await this.close();
      process.exit(0);
    } catch (err) {
      this.logger.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  public constructor(input: AgentRuntimeInput<T>) {
    this.runtimeConfig = input.runtimeConfig;
    this.runtimeResources = input.runtimeResources;
    this.logger = createEventBusLogger(this.runtimeResources.bus);

    const handlers = input.handlers ?? buildDefaultNodeHandlers<T>();
    const graph = buildEngineGraphSpec<T>(handlers);
    this.executor = new EngineExecutor(graph);

    const routerGraph = buildRouterGraphSpec<T>();
    this.routerExecutor = new EngineExecutor(routerGraph);
    this.routerSaver = new MemoryCheckpointer<RouterState>();
    // UI server will be resolved asynchronously in start()
  }

  /**
   * Starts all underlying resources (adapters, graph engine, and UI server).
   * It also binds the inbound transport handler for message intake and concurrency.
   *
   * @throws Error if any adapter fails to start.
   */
  public async start(): Promise<void> {
    // Dashboard and other resources receive the bus via context in startResources below
    this.logger.info("Starting AgentRuntime.");

    // Concurrency limiting via Middleware
    const maxConcurrent = this.runtimeConfig.maxInboundConcurrency ?? 32;
    this.runtimeResources.bus.use(
      createInboundConcurrencyLimiter(this.runtimeResources.bus, maxConcurrent),
    );

    // Response to overload events
    this.runtimeResources.bus.subscribe<{ inbound: InboundMessage }>(
      "transport:inbound:overload",
      async (event) => {
        const message = this.runtimeConfig.overloadMessage?.trim();
        if (message) {
          await this.runtimeResources.transport
            .sendText(event.payload.inbound.from, message)
            .catch((err) => {
              this.logger.error(
                { err, inbound: event.payload.inbound },
                "Failed to send overload message",
              );
            });
        }
      },
    );

    this.runtimeResources.bus.subscribe<InboundMessage>("transport:inbound", async (event) => {
      // Basic intake - concurrency limiting moves to Phase 3 Middleware
      await this.runInbound(event.payload).catch((err) => {
        this.logger.error({ err, inbound: event.payload }, "Inbound processing failed");
      });
    });

    // Reactive UI:
    // Manual glue removed. ReactiveUiProvider is now an autonomous EventBus citizen.
    // It emits 'transport:inbound' and subscribes to 'agent:stream:*' natively.

    this.lifecycleResources = collectLifecycleResources(this.runtimeResources);
    try {
      const context: RuntimeResourceContext = {
        bus: this.runtimeResources.bus,
        logger: this.logger,
      };
      await startResources(this.lifecycleResources, context);
    } catch (error) {
      throw error;
    }

    process.on("SIGINT", this.handleShutdown);
    process.on("SIGTERM", this.handleShutdown);
  }

  /**
   * Stops all underlying resources gracefully, releasing memory and active ports.
   */
  public async close(): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    process.removeListener("SIGINT", this.handleShutdown);
    process.removeListener("SIGTERM", this.handleShutdown);

    this.logger.info("Closing AgentRuntime");

    await closeResources(this.lifecycleResources);
    this.lifecycleResources = [];
  }

  /**
   * Access the direct event bus for this runtime.
   */
  public get bus() {
    return this.runtimeResources.bus;
  }

  /**
   * Invokes the execution graph manually for a specific inbound message.
   * Normally used for testing or advanced scenarios, as `start()` automatically
   * binds logic to consume transport messages.
   */
  public async runInbound(inbound: InboundMessage): Promise<RuntimeEngineContext<T>> {
    const requestId = randomUUID();
    const logger = this.logger.child({ requestId });

    logger.info({ inbound }, "Inbound message received");
    this.runtimeResources.bus.emit({
      channel: "runtime",
      name: "inbound:received",
      payload: { inbound },
    });

    const startedAt = new Date();

    const context = createInitialRuntimeContext<T>({
      requestId,
      startedAt,
      runtimeConfig: this.runtimeConfig,
      runtimeResources: this.runtimeResources,
      inbound,
      logger: this.logger,
    });

    // Phase 1: Invoke stateless Router Graph to resolve Identity and Session.
    const routerResult = await this.routerExecutor.invoke({ inbound }, context, {
      threadId: `router:${requestId}`,
      checkpointer: this.routerSaver,
      entrypoint: "identity_resolution",
    });

    const { user, session } = routerResult.values;

    if (!user || !session) {
      throw new Error("Logic Error: Router failed to resolve user or session");
    }

    // Phase 2: Invoke the main Agent Graph using the resolved sessionId as the threadId.
    context.state = {
      ...context.state,
      user,
      session,
      inbound,
    };

    const threadId = session.id;

    try {
      await this.executor.invoke(context.state, context, {
        threadId,
        checkpointer: this.runtimeResources.checkpointer,
        ledger: this.runtimeResources.ledger,
        entrypoint: "turn_setup",
        onStepComplete: async (_, writes) => {
          if (writes.agentState && this.runtimeResources.reactiveUi && inbound.clientId) {
            this.runtimeResources.reactiveUi.emitStateDelta(inbound.clientId, writes.agentState);
          }
        },
      });

      logger.info({ from: inbound.from }, "Inbound message processed");
      this.runtimeResources.bus.emit({
        channel: "runtime",
        name: "inbound:processed",
        payload: {
          requestId,
          from: inbound.from,
        },
      });
    } catch (error) {
      logger.error({ error: String(error), inbound }, "Inbound message failed");
      this.runtimeResources.bus.emit({
        channel: "runtime",
        name: "inbound:failed",
        payload: {
          requestId,
          error: String(error),
          inbound,
        },
      });
      throw error;
    }

    return context;
  }
}
