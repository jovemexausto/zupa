import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_USER
} from '@zupa/testing';
import { AgentRuntime } from '../src/index';

describe('Tools Capability Slice', () => {
  it('should execute tools correctly', async () => {
    const deps = createFakeRuntimeDeps();
    const runtimeConfig = createFakeRuntimeConfig({
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: z.object({ location: z.string() }),
          handler: async (params: any) => `Weather in ${params.location} is 25 degrees`
        }
      ]
    });

    const runtime = new AgentRuntime({
      runtimeConfig,
      runtimeResources: deps
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({
        content: null,
        toolCalls: [
          { id: 'call_1', name: 'get_weather', arguments: { location: 'London' } }
        ]
      }),
      createFakeLLMResponse({
        content: 'It is 25 degrees in London',
        structured: { reply: 'It is 25 degrees in London' }
      })
    ]);

    await runtime.start();
    const user = await deps.database.createUser(DEFAULT_USER);
    await runtime.runInbound({
      from: DEFAULT_USER.externalUserId,
      body: 'What is the weather in London?',
      fromMe: false
    });

    const transport = deps.transport as FakeMessagingTransport;
    const sent = transport.getSentMessages();
    expect(sent.some(m => m.text?.includes('25 degrees'))).toBe(true);
    await runtime.close();
  });
});
