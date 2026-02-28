import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/index';
import {
  FakeMessagingTransport,
  createFakeRuntimeDeps
} from '@zupa/testing';

describe('createAgent lifecycle', () => {
  it('registers inbound callback on start and unregisters on close', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;

    const agent = createAgent({
      prompt: 'hello',
      ui: false,
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

    expect(transport.inboundSubscriptions).toBe(0);

    await agent.start();
    expect(transport.inboundSubscriptions).toBe(1);

    await transport.emitInbound({ from: '+15550001111', body: 'hello', fromMe: false });

    await agent.close();
    expect(transport.inboundUnsubscriptions).toBe(1);

    await transport.emitInbound({ from: '+15550001111', body: 'hello-again', fromMe: false });
  });

  it('starts resources in declared order and closes in reverse order', async () => {
    const deps = createFakeRuntimeDeps();
    const events: string[] = [];

    const mark = (name: string, target: any) => {
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
      ui: false,
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
});
