import { describe, expect, it } from 'vitest';

import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { createInitialRuntimeContext, runKernelPhases, KernelPhaseName } from '../src/core/kernel';

const deps = createFakeRuntimeDeps();

function createContext() {
  return createInitialRuntimeContext({
    requestId: 'req_1',
    startedAt: new Date('2026-02-24T00:00:00.000Z'),
    inbound: { from: 'u1', body: 'hello', fromMe: false },
    runtimeConfig: {
      prompt: 'hi',
      language: 'en',
    },
    runtimeResources: {
      transport: deps.transport,
      llm: deps.llm,
      stt: deps.stt,
      tts: deps.tts,
      storage: deps.storage,
      vectors: deps.vectors,
      database: deps.database,
      telemetry: deps.telemetry
    }
  });
}

describe('runKernelPhases', () => {
  it('runs phases in declared order and records durations with hooks', async () => {
    const context = createContext();
    const phaseEvents: string[] = [];

    const result = await runKernelPhases({
      context,
      phases: [
        {
          name: 'access_policy',
          run: async (ctx) => {
            phaseEvents.push('run:access_policy');
            ctx.state.accessAllowed = true;
          }
        },
        {
          name: 'session_attach',
          run: async (ctx) => {
            phaseEvents.push('run:session_attach');
            ctx.state.sessionAttached = true;
          }
        }
      ],
      hooks: {
        onPhaseStart: ({ phase }) => phaseEvents.push(`start:${phase}`),
        onPhaseEnd: ({ phase }) => phaseEvents.push(`end:${phase}`)
      }
    });

    expect(phaseEvents).toEqual([
      'start:access_policy',
      'run:access_policy',
      'end:access_policy',
      'start:session_attach',
      'run:session_attach',
      'end:session_attach'
    ]);

    expect(result.state.accessAllowed).toBe(true);
    expect(result.state.sessionAttached).toBe(true);

    expect(result.telemetry.phaseDurationsMs.access_policy).toBeTypeOf('number');
    expect(result.telemetry.phaseDurationsMs.session_attach).toBeTypeOf('number');
  });

  it('calls error hook and rethrows when a phase fails', async () => {
    const context = createContext();
    const errors: Array<{ phase: KernelPhaseName; code: string }> = [];

    await expect(
      runKernelPhases({
        context,
        phases: [
          {
            name: 'access_policy',
            run: async () => {
              throw new Error('boom');
            }
          }
        ],
        hooks: {
          onPhaseError: ({ phase, error }) => {
            errors.push({
              phase,
              code: error instanceof Error ? error.message : 'unknown'
            });
          }
        }
      })
    ).rejects.toThrowError('boom');

    expect(errors).toEqual([{ phase: 'access_policy', code: 'boom' }]);
  });
});
