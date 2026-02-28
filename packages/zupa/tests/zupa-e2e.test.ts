import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/index';
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeLLMResponse,
  DEFAULT_INBOUND
} from '@zupa/testing';

describe('Zupa E2E (Simulated)', () => {
  it('should process a message end-to-end with fakes', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;
    const llm = deps.llm as FakeLLMProvider;

    llm.setResponses([
      createFakeLLMResponse({
        content: 'I am helping you!',
        structured: { reply: 'I am helping you!' }
      })
    ]);

    const agent = createAgent({
      prompt: 'You are a help assistant',
      ui: false,
      providers: {
        transport,
        llm,
        database: deps.database,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors
      }
    });

    await agent.start();

    // Trigger inbound
    await transport.emitInbound(DEFAULT_INBOUND);

    // Verify outbound
    const sent = transport.getSentMessages();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]?.text).toBe('I am helping you!');

    await agent.close();
  });
});
