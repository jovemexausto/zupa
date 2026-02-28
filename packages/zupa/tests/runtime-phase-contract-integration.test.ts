import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { executeKernelPipeline } from '../src/core/kernel/execute';
import { definePhase, PhaseContractError } from '../src/core/kernel/phase';
import { createFakeRuntimeDeps } from '../src/testing/fakes';

const deps = createFakeRuntimeDeps();

describe('runtime phase contract integration', () => {
  it('fails fast when a phase does not provide declared output', async () => {
    const runtimeConfig = {
      prompt: 'hello',
      language: 'en' as const,
    };
    const runtimeResources = {
      transport: deps.transport,
      llm: deps.llm,
      stt: deps.stt,
      tts: deps.tts,
      storage: deps.storage,
      vectors: deps.vectors,
      database: deps.database,
      telemetry: deps.telemetry
    };

    await expect(
      executeKernelPipeline({
        requestId: 'req_123',
        startedAt: new Date(),
        runtimeConfig,
        runtimeResources,
        inbound: { from: '+15550002222', body: 'hello', fromMe: false },
        handlers: {
          access_policy: definePhase({
            name: 'access_policy',
            requires: z.object({}),
            provides: z.object({ access: z.object({ allowed: z.boolean() }) }),
            run: async () => {
              return;
            }
          })
        }
      })
    ).rejects.toBeInstanceOf(PhaseContractError);

    await expect(
      executeKernelPipeline({
        requestId: 'req_123',
        startedAt: new Date(),
        runtimeConfig,
        runtimeResources,
        inbound: { from: '+15550002222', body: 'hello', fromMe: false },
        handlers: {
          access_policy: definePhase({
            name: 'access_policy',
            requires: z.object({}),
            provides: z.object({ access: z.object({ allowed: z.boolean() }) }),
            run: async () => {
              return;
            }
          })
        }
      })
    ).rejects.toThrow('[access_policy] provides validation failed');
  });
});
