import { describe, expect, it } from 'vitest';
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_INBOUND
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
});
