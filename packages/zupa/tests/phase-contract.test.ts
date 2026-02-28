import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { RuntimeKernelContext } from '../src/core/kernel';
import { definePhase, PhaseContractError } from '../src/core/kernel/phase';

const deps = createFakeRuntimeDeps();

function createContext(state: Record<string, unknown> = {}): RuntimeKernelContext {
  return {
    meta: { requestId: 'req-1', startedAt: new Date('2026-02-24T00:00:00.000Z') },
    config: {
      prompt: 'hello',
      language: 'en',
    },
    inbound:  {
      from   : '15551234567',
      body   : 'hello',
      fromMe : false,
    },
    resources: {
      transport: deps.transport,
      llm: deps.llm,
      stt: deps.stt,
      tts: deps.tts,
      storage: deps.storage,
      vectors: deps.vectors,
      database: deps.database,
      telemetry: deps.telemetry
    },
    transport: deps.transport,
    state,
    telemetry: { phaseDurationsMs: {} }
  };
}

describe('phaseContract DSL', () => {
  it('throws when required state key is missing', async () => {
    const phase = definePhase({
      name: 'access_policy',
      requires: z.object({ access: z.object({ allowed: z.boolean() }) }),
      run: async () => {
        return;
      }
    });

    await expect(phase(createContext({}))).rejects.toBeInstanceOf(PhaseContractError);
    await expect(phase(createContext({}))).rejects.toThrow('[access_policy] requires validation failed');
  });

  it('throws when required state key has invalid type', async () => {
    const phase = definePhase({
      name: 'access_policy',
      requires: z.object({ commandHandled: z.boolean() }),
      run: async () => {
        return;
      }
    });

    await expect(phase(createContext({ commandHandled: 'no' }))).rejects.toThrow('[access_policy] requires validation failed');
  });

  it('throws when provided state key is missing after run', async () => {
    const phase = definePhase({
      name: 'prompt_build',
      requires: z.object({ assembledContext: z.record(z.string(), z.unknown()) }),
      provides: z.object({ promptInput: z.object({ systemPrompt: z.string(), messages: z.array(z.unknown()) }) }),
      run: async () => {
        return;
      }
    });

    await expect(phase(createContext({ assembledContext: {} }))).rejects.toThrow('[prompt_build] provides validation failed');
  });

  it('allows extra state keys while validating required/provided keys', async () => {
    const phase = definePhase({
      name: 'context_assembly',
      requires: z.object({ userRef: z.object({ id: z.string() }) }),
      provides: z.object({ assembledContext: z.record(z.string(), z.unknown()) }),
      run: async (ctx) => {
        ctx.state.assembledContext = { ok: true };
      }
    });

    const context = createContext({ userRef: { id: 'u1' }, extraSharedKey: 123 });
    await expect(phase(context)).resolves.toBeUndefined();
    expect(context.state.extraSharedKey).toBe(123);
  });
});
