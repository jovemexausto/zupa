import { EventEmitter } from 'node:events';

import type { RuntimeConfig, RuntimeResource } from './types';
import { bindTransportInbound } from './inbound/transportBridge';
import { closeResources, collectLifecycleResources, startResources } from './resources/lifecycle';
import { randomUUID } from 'node:crypto';
import { RuntimeKernelResources, KernelPhaseHandlers, RuntimeKernelContext, executeKernelPipeline } from '../kernel';
import { buildDefaultKernelHandlers } from '../kernel/phases';
import { InboundMessage } from '../ports';
import { RuntimeUiServer } from './ui/server';

interface AgentRuntimeInput {
  runtimeConfig: RuntimeConfig;
  runtimeResources: RuntimeKernelResources;
  handlers?: KernelPhaseHandlers;
}

export class AgentRuntime {
  private readonly emitter = new EventEmitter();
  private readonly runtimeConfig: RuntimeConfig;
  private readonly runtimeResources: RuntimeKernelResources;
  private readonly handlers: KernelPhaseHandlers;
  private stopInboundBridge: (() => void) | null = null;
  private stopAuthBridge: (() => void) | null = null;
  private lifecycleResources: RuntimeResource[] = [];
  private readonly uiServer: RuntimeUiServer | null;

  public constructor(input: AgentRuntimeInput) {
    this.runtimeConfig = input.runtimeConfig;
    this.runtimeResources = input.runtimeResources;
    this.handlers = input.handlers ?? buildDefaultKernelHandlers();
    const ui = input.runtimeConfig.ui;
    this.uiServer =
      ui?.enabled === false
        ? null
        : (() => {
          const options = {
            host: ui?.host ?? '127.0.0.1',
            port: ui?.port ?? 4200,
            sseHeartbeatMs: ui?.sseHeartbeatMs ?? 15_000
          };
          if (ui?.authToken !== undefined) {
            (options as { authToken?: string }).authToken = ui.authToken;
          }
          if (ui?.corsOrigin !== undefined) {
            (options as { corsOrigin?: string | string[] }).corsOrigin = ui.corsOrigin;
          }
          return new RuntimeUiServer(options);
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
      runInboundKernel: async (inbound) => {
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

  public async runInbound(inbound: InboundMessage): Promise<RuntimeKernelContext> {
    this.emitRuntimeEvent('inbound:received', { inbound });
    const startedAt = new Date()
    const requestId = randomUUID()
    try {
      const result = await executeKernelPipeline({
        requestId, startedAt,
        //
        runtimeConfig    : this.runtimeConfig,
        runtimeResources : this.runtimeResources,
        inbound          : inbound,
        handlers         : this.handlers,
      });
      this.emitRuntimeEvent('inbound:processed', { requestId, from: inbound.from });
      return result;
    } catch (error) {
      this.emitRuntimeEvent('inbound:failed', { requestId, error: String(error), inbound });
      throw error;
    }
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
