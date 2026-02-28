import { describe, expect, it } from 'vitest';

import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { executeKernelPipeline } from '../src/core/kernel';
import { randomUUID } from 'node:crypto';

describe('kernel execute purity', () => {
  it('does not subscribe transport inbound or start/close resources', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;
    const transportWithLifecycle = transport as FakeMessagingTransport & {
      start?: () => Promise<void>;
      close?: () => Promise<void>;
    };
    let transportStartCalls = 0;
    let transportCloseCalls = 0;

    transportWithLifecycle.start = async () => { transportStartCalls += 1; };
    transportWithLifecycle.close = async () => { transportCloseCalls += 1; };

      const startedAt = new Date()
      const requestId = randomUUID()

    const context = await executeKernelPipeline({
      requestId, startedAt,
      
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
      inbound: { from: '+15550002222', body: 'hello', fromMe: false }
    });

    expect(context.inbound).toEqual({ from: '+15550002222', body: 'hello', fromMe: false });
    expect(Object.prototype.hasOwnProperty.call(context.state, 'inbound')).toBe(false);
    expect(transport.inboundSubscriptions).toBe(0);
    expect(transport.inboundUnsubscriptions).toBe(0);
    expect(transportStartCalls).toBe(0);
    expect(transportCloseCalls).toBe(0);
  });
});
