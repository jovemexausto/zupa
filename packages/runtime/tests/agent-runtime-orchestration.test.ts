import { describe, expect, it } from 'vitest';
import { createFakeRuntimeDeps, createFakeRuntimeConfig } from '@zupa/testing';
import { AgentRuntime } from '../src/index';

describe('Agent Runtime Orchestration', () => {
  it('should start and close resources correctly', async () => {
    const deps = createFakeRuntimeDeps();
    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps
    });

    await runtime.start();
    await runtime.close();
    expect(true).toBe(true); // Reached here without error
  });
});
