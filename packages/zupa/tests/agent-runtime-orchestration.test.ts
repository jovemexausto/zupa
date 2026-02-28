import { describe, expect, it } from 'vitest';

import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { KernelPhaseHandlers } from '../src/core/kernel';
import { AgentRuntime } from '../src/core/runtime';

describe('AgentRuntime orchestration', () => {
  it('starts resources, processes inbound, and unsubscribes on close', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;
    const transportWithLifecycle = transport as FakeMessagingTransport & {
      start?: () => Promise<void>;
      close?: () => Promise<void>;
    };
    const seenInboundTypes: string[] = [];
    const events: string[] = [];

    deps.database.start = async () => { events.push('start:db'); };
    transportWithLifecycle.start = async () => { events.push('start:transport'); };
    transportWithLifecycle.close = async () => { events.push('close:transport'); };
    deps.database.close = async () => { events.push('close:db'); };

    const handlers: KernelPhaseHandlers = {
      access_policy: async (ctx) => {
        const type = typeof ctx.inbound.type === 'string' ? ctx.inbound.type : 'inbound';
        seenInboundTypes.push(type);
      }
    };

    const runtime = new AgentRuntime({
      runtimeConfig: {
        prompt: 'hello',
        language: 'en'
      },
      runtimeResources: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      handlers
    });

    await runtime.start();
    await transport.emitInbound({ from: '+15550001111', body: 'hello', fromMe: false });
    await runtime.close();

    expect(seenInboundTypes).toEqual(['inbound']);
    expect(transport.inboundSubscriptions).toBe(1);
    expect(transport.inboundUnsubscriptions).toBe(1);
    expect(transport.inboundHandlerCount).toBe(0);
    expect(events).toEqual([
      'start:db',
      'start:transport',
      'close:transport',
      'close:db'
    ]);
  });

  it('sheds overload when inbound concurrency limit is reached', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;
    const started: Array<string> = [];
    let releaseFirst: (() => void) | undefined;

    const handlers: KernelPhaseHandlers = {
      access_policy: async (ctx) => {
        started.push(String(ctx.inbound.body));
        if (ctx.inbound.body === 'first') {
          await new Promise<void>((resolve) => {
            releaseFirst = () => resolve();
          });
        }
      }
    };

    const runtime = new AgentRuntime({
      runtimeConfig: {
        prompt: 'hello',
        language: 'en',
        maxInboundConcurrency: 1,
        overloadMessage: 'busy now'
      } as never,
      runtimeResources: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      handlers
    });

    await runtime.start();
    const first = transport.emitInbound({ from: '+15550001111', body: 'first', fromMe: false });
    await Promise.resolve();
    const second = transport.emitInbound({ from: '+15550001111', body: 'second', fromMe: false });
    await Promise.resolve();
    if (releaseFirst === undefined) {
      throw new Error('first inbound did not reach handler');
    }
    releaseFirst();
    await first;
    await second;
    await runtime.close();

    expect(started).toEqual(['first']);
    expect(transport.sentText.at(-1)).toEqual({ to: '+15550001111', text: 'busy now' });
  });
});
