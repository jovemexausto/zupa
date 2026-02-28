import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/index';
import { createFakeRuntimeDeps } from '@zupa/testing';

describe('createAgent types and interface', () => {
  it('should be correctly typed and exportable', () => {
    const deps = createFakeRuntimeDeps();
    const config = {
      prompt: 'hello',
      providers: {
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        transport: deps.transport,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database
      }
    };

    const agent = createAgent(config);
    expect(agent).toBeDefined();
    expect(agent.start).toBeDefined();
    expect(agent.close).toBeDefined();
  });
});
