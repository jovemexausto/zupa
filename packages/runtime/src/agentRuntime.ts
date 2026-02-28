import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import {
  RuntimeConfig,
  RuntimeResource,
  RuntimeEngineResources,
  RuntimeEngineContext,
  InboundMessage
} from '@zupa/core';

import {
  EngineExecutor,
  createInitialRuntimeContext
} from '@zupa/engine';

import { EphemeralCheckpointSaver } from './engine/ephemeralSaver';
import { buildEngineGraphSpec } from './engine/graph';

import { bindTransportInbound, type TransportInboundBinding } from './inbound/transportBridge';
import { closeResources, collectLifecycleResources, startResources } from './resources/lifecycle';
import { buildDefaultNodeHandlers, type RuntimeState, type RuntimeNodeHandlerMap } from './nodes';
import { RuntimeUiServer } from './ui/server';


/**
 * Input configuration required to boot an AgentRuntime instance.
 */
export interface AgentRuntimeInput<T = unknown> {
  runtimeConfig: RuntimeConfig<T>;
  runtimeResources: RuntimeEngineResources;
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
  private readonly emitter = new EventEmitter();
  private readonly runtimeConfig: RuntimeConfig<T>;
  private readonly runtimeResources: RuntimeEngineResources;
  private readonly executor: EngineExecutor<RuntimeState, RuntimeEngineContext<T>>;
  private inboundBridge: TransportInboundBinding | null = null;
  private stopAuthBridge: (() => void) | null = null;
  private lifecycleResources: RuntimeResource[] = [];
  private readonly uiServer: RuntimeUiServer | null;

  public constructor(input: AgentRuntimeInput<T>) {
    this.runtimeConfig = input.runtimeConfig;
    this.runtimeResources = input.runtimeResources;

    const handlers = input.handlers ?? buildDefaultNodeHandlers<T>();
    const graph = buildEngineGraphSpec<T>(handlers);
    this.executor = new EngineExecutor(graph);

    const ui = input.runtimeConfig.ui;
    this.uiServer =
      ui?.enabled === false
        ? null
        : (() => {
          return new RuntimeUiServer({
            host: ui?.host ?? '127.0.0.1',
            port: ui?.port ?? 5557,
            sseHeartbeatMs: ui?.sseHeartbeatMs ?? 15_000,
            authToken: ui?.authToken,
            corsOrigin: ui?.corsOrigin
          });
        })();
  }

  /**
   * Starts all underlying resources (adapters, graph engine, and UI server).
   * It also binds the inbound transport handler for message intake and concurrency.
   * 
   * @throws Error if any adapter fails to start.
   */
  public async start(): Promise<void> {
    if (this.uiServer) {
      await this.uiServer.start();
    }

    this.stopAuthBridge = this.bindTransportAuth();
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
        this.emitRuntimeEvent('inbound:overload', { inbound });
      },
      onError: (error, inbound) => {
        this.emitRuntimeEvent('inbound:error', { error: String(error), inbound });
      }
    });
  }

  /**
   * Stops all underlying resources gracefully, releasing memory and active ports.
   */
  public async close(): Promise<void> {
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
   * Useful for hooking into authentication flows (e.g., retrieving WhatsApp QR codes).
   */
  public on(event: 'auth:qr' | 'auth:ready' | string, handler: (...args: unknown[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  /**
   * Invokes the execution graph manually for a specific inbound message.
   * Normally used for testing or advanced scenarios, as `start()` automatically
   * binds logic to consume transport messages.
   */
  public async runInbound(inbound: InboundMessage): Promise<RuntimeEngineContext<T>> {
    this.emitRuntimeEvent('inbound:received', { inbound });

    const requestId = randomUUID();
    const startedAt = new Date();

    const context = createInitialRuntimeContext<T>({
      requestId,
      startedAt,
      runtimeConfig: this.runtimeConfig,
      runtimeResources: this.runtimeResources,
      inbound,
    });

    const saver = new EphemeralCheckpointSaver();
    const threadId = requestId;

    try {
      await this.executor.invoke(
        context.state,
        context,
        {
          threadId,
          saver,
          entrypoint: 'event_dedup_gate'
        }
      );
      this.emitRuntimeEvent('inbound:processed', { requestId, from: inbound.from });
    } catch (error) {
      this.emitRuntimeEvent('inbound:failed', { requestId, error: String(error), inbound });
      throw error;
    }

    return context;
  }

  private bindTransportAuth(): (() => void) | null {
    const transport = this.runtimeResources.transport;
    const unsubs: Array<() => void> = [];

    if (transport.onAuthQr) {
      unsubs.push(transport.onAuthQr((qr) => {
        this.uiServer?.setLatestQr(qr);
        this.emitRuntimeEvent('auth:qr', qr);
      }));
    }

    if (transport.onAuthReady) {
      unsubs.push(transport.onAuthReady(() => {
        this.uiServer?.setOnlineStatus(true);
        this.emitRuntimeEvent('auth:ready', undefined);
      }));
    }

    if (transport.onAuthFailure) {
      unsubs.push(transport.onAuthFailure((message) => {
        this.emitRuntimeEvent('auth:failure', message);
      }));
    }

    if (unsubs.length === 0) {
      return null;
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  private emitRuntimeEvent(event: string, payload: unknown): void {
    this.emitter.emit(event, payload);
    this.uiServer?.publish(event, payload);
  }
}
