import { describe, expect, it } from 'vitest';
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_INBOUND,
  FakeReactiveUiProvider
} from '@zupa/testing';
import { AgentRuntime } from '../src/index';

describe('response capability slice', () => {
  it('falls back to text when structured is missing', async () => {
    const deps = createFakeRuntimeDeps();
    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({
        content: 'Simple text reply',
        structured: null
      })
    ]);

    await runtime.start();
    await runtime.runInbound(DEFAULT_INBOUND);

    const transport = deps.transport as FakeMessagingTransport;
    const sent = transport.getSentMessages();
    expect(sent.some(m => m.text === 'Simple text reply')).toBe(true);
    await runtime.close();
  });

  it('streams tokens to reactive UI when strategy is streaming and source is ui_channel', async () => {
    const deps = createFakeRuntimeDeps();
    const reactiveUi = deps.reactiveUi as FakeReactiveUiProvider;
    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig({
        finalizationStrategy: 'streaming',
      }),
      runtimeResources: deps
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({
        content: 'Streaming reply',
        structured: null
      })
    ]);

    await runtime.start();
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      source: 'ui_channel',
      clientId: 'client-1'
    });

    // Check if chunks were emitted
    const chunks = reactiveUi.emittedChunks.filter(c => c.clientId === 'client-1');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.map(c => c.chunk.content).join('')).toBe('Streaming reply');

    // Also ensures it finalised
    const transport = deps.transport as FakeMessagingTransport;
    const sent = transport.getSentMessages();
    expect(sent.some(m => m.text === 'Streaming reply')).toBe(true);

    await runtime.close();
  });
});
