import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/index';
import { createFakeRuntimeDeps } from '@zupa/testing';

const baseDeps = createFakeRuntimeDeps();

const baseConfig: any = {
  prompt: 'hello',
  providers: {
    llm: baseDeps.llm,
    stt: baseDeps.stt,
    tts: baseDeps.tts,
    transport: baseDeps.transport,
    storage: baseDeps.storage,
    vectors: baseDeps.vectors,
    database: baseDeps.database
  }
};

describe('createAgent config resolution', () => {
  it('creates an agent with defaults', () => {
    const agent = createAgent(baseConfig);
    expect(agent).toBeDefined();
    expect(typeof agent.start).toBe('function');
  });

  it('accepts language override', () => {
    const agent = createAgent({
      ...baseConfig,
      language: 'es'
    });
    expect(agent).toBeDefined();
  });
});
