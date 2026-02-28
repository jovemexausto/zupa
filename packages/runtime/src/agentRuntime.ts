import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import {
  RuntimeConfig,
  RuntimeResource,
  RuntimeEngineResources,
  RuntimeEngineContext,
  EngineNodeName,
  InboundMessage,
  StateSnapshot,
  CheckpointSaver,
  LedgerEvent,
  LedgerWriter,
  NodeResult
} from '@zupa/core';

import {
  EngineExecutor,
  type EngineGraphSpec,
  CanonicalChannels,
  lastWriteWinsReducer,
  createInitialRuntimeContext,
  type ChannelReducer
} from '@zupa/engine';

import { bindTransportInbound } from './inbound/transportBridge';
import { closeResources, collectLifecycleResources, startResources } from './resources/lifecycle';
import { buildDefaultNodeHandlers, type RuntimeState, type RuntimeNodeHandlerMap } from './nodes';
import { RuntimeUiServer } from './ui/server';

// ---------------------------------------------------------------------------
// In-process checkpoint saver (ephemeral, per-request thread)
// ---------------------------------------------------------------------------
class EphemeralCheckpointSaver implements CheckpointSaver<RuntimeState>, LedgerWriter {
  private checkpoints = new Map<string, StateSnapshot<RuntimeState>>();

  async getCheckpoint(threadId: string): Promise<StateSnapshot<RuntimeState> | null> {
    return this.checkpoints.get(threadId) ?? null;
  }

  async putCheckpoint(threadId: string, checkpoint: StateSnapshot<RuntimeState>): Promise<void> {
    this.checkpoints.set(threadId, checkpoint);
  }

  async getCheckpointById(_threadId: string, checkpointId: string): Promise<StateSnapshot<RuntimeState> | null> {
    for (const cp of this.checkpoints.values()) {
      if (cp.checkpointId === checkpointId) return cp;
    }
    return null;
  }

  async getCheckpointHistory(_threadId: string): Promise<StateSnapshot<RuntimeState>[]> {
    return [];
  }

  async appendLedgerEvent(_sessionId: string, _event: LedgerEvent): Promise<void> {
    // No-op in ephemeral path
  }
}

// ---------------------------------------------------------------------------
// Build a EngineGraphSpec from the node handlers
// ---------------------------------------------------------------------------
function buildEngineGraphSpec<T = unknown>(
  handlers: RuntimeNodeHandlerMap<T>
): EngineGraphSpec<RuntimeState, RuntimeEngineContext<T>> {
  const channels: { [K in keyof RuntimeState]: ChannelReducer<RuntimeState[K]> } = {
    access: lastWriteWinsReducer(),
    session: lastWriteWinsReducer(),
    user: lastWriteWinsReducer(),
    replyTarget: lastWriteWinsReducer(),
    inboundDuplicate: lastWriteWinsReducer(),
    createdUser: lastWriteWinsReducer(),
    resolvedContent: lastWriteWinsReducer(),
    inbound: lastWriteWinsReducer(),
    commandHandled: lastWriteWinsReducer(),
    assembledContext: lastWriteWinsReducer(),
    builtPrompt: lastWriteWinsReducer(),
    llmResponse: lastWriteWinsReducer(),
    toolResults: (prev, update) => CanonicalChannels.toolResults(prev, update || [])
  };

  return {
    channels,
    nodes: handlers
  };
}

// ---------------------------------------------------------------------------
// AgentRuntime
// ---------------------------------------------------------------------------
interface AgentRuntimeInput<T = unknown> {
  runtimeConfig: RuntimeConfig<T>;
  runtimeResources: RuntimeEngineResources;
  handlers?: RuntimeNodeHandlerMap<T>;
}

export class AgentRuntime<T = unknown> {
  private readonly emitter = new EventEmitter();
  private readonly runtimeConfig: RuntimeConfig<T>;
  private readonly runtimeResources: RuntimeEngineResources;
  private readonly executor: EngineExecutor<RuntimeState, RuntimeEngineContext<T>>;
  private stopInboundBridge: (() => void) | null = null;
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

    this.stopInboundBridge = bindTransportInbound({
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

  public async close(): Promise<void> {
    if (this.stopInboundBridge) {
      this.stopInboundBridge();
      this.stopInboundBridge = null;
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

  public on(event: 'auth:qr' | 'auth:ready' | string, handler: (...args: unknown[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

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
          entrypoint: 'access_policy'
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
