import { describe, expect, it } from 'vitest';

import { createAgent } from '../src/api/createAgent';
import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { createFakeRuntimeDeps } from '../src/testing/fakes';

describe('createAgent lifecycle', () => {
  it('registers inbound callback on start and unregisters on close', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      }
    });

    expect(transport.inboundHandlerCount).toBe(0);

    await agent.start();
    expect(transport.inboundSubscriptions).toBe(1);
    expect(transport.inboundHandlerCount).toBe(1);

    await transport.emitInbound({ from: '+15550001111', body: 'hello', fromMe: false });
    expect(transport.inboundDeliveries).toBe(1);

    await agent.close();
    expect(transport.inboundUnsubscriptions).toBe(1);
    expect(transport.inboundHandlerCount).toBe(0);

    await transport.emitInbound({ from: '+15550001111', body: 'hello-again', fromMe: false });
    expect(transport.inboundDeliveries).toBe(1);
  });

  it('starts resources in declared order and closes in reverse order', async () => {
    const deps = createFakeRuntimeDeps();
    const events: string[] = [];

    const mark = (name: string, target: { start?(): Promise<void>; close?(): Promise<void> }) => {
      target.start = async () => {
        events.push(`start:${name}`);
      };
      target.close = async () => {
        events.push(`close:${name}`);
      };
    };

    mark('db', deps.database);
    mark('file', deps.storage);
    mark('vector', deps.vectors);
    mark('llm', deps.llm);
    mark('stt', deps.stt);
    mark('tts', deps.tts);
    mark('transport', deps.transport);

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport: deps.transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      }
    });

    await agent.start();
    await agent.close();

    expect(events).toEqual([
      'start:db',
      'start:file',
      'start:vector',
      'start:llm',
      'start:stt',
      'start:tts',
      'start:transport',
      'close:transport',
      'close:tts',
      'close:stt',
      'close:llm',
      'close:vector',
      'close:file',
      'close:db'
    ]);
  });

  it('forwards transport auth events to agent listeners during startup', async () => {
    const deps = createFakeRuntimeDeps();

    class AuthAwareTransport extends FakeMessagingTransport {
      private readonly qrHandlers = new Set<(qr: string) => void>();
      private readonly readyHandlers = new Set<() => void>();

      public onAuthQr(handler: (qr: string) => void): () => void {
        this.qrHandlers.add(handler);
        return () => this.qrHandlers.delete(handler);
      }

      public onAuthReady(handler: () => void): () => void {
        this.readyHandlers.add(handler);
        return () => this.readyHandlers.delete(handler);
      }

      public async start(): Promise<void> {
        for (const handler of this.qrHandlers) {
          handler('sample-qr');
        }

        for (const handler of this.readyHandlers) {
          handler();
        }
      }
    }

    const authTransport = new AuthAwareTransport();
    const qrEvents: string[] = [];
    let readyEvents = 0;

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport: authTransport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      }
    });

    agent.on('auth:qr', (qr) => {
      qrEvents.push(String(qr));
    });
    agent.on('auth:ready', () => {
      readyEvents += 1;
    });

    await agent.start();

    expect(qrEvents).toEqual(['sample-qr']);
    expect(readyEvents).toBe(1);
  });
});
