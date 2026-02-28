import { describe, expect, it } from 'vitest';

import { createOpenAITestingAgent } from '../src/testing/openaiTestingAgent';

describe('openai testing agent', () => {
  it('builds a startable agent with real openai providers and fake infra deps', async () => {
    const { agent, deps } = createOpenAITestingAgent({
      prompt: 'You are a testing agent',
      apiKey: 'sk-test',
      llmModel: 'gpt-4o-mini',
      ttsVoice: 'alloy'
    });

    await expect(agent.start()).resolves.toBeUndefined();
    expect(deps.llm).toBeDefined();
    expect(deps.stt).toBeDefined();
    expect(deps.tts).toBeDefined();
    await expect(agent.close()).resolves.toBeUndefined();
  });
});
