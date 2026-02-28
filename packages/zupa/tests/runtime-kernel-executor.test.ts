import { describe, expect, it } from 'vitest';

import { __private } from '../src/api/createAgent';
import { KERNEL_PHASE_ORDER } from '../src/core/kernel/context';
import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { buildDefaultKernelHandlers } from '../src/core/kernel/phases';
import { RuntimeConfig } from '../src/core/runtime';
import { executeKernelPipeline, RuntimeKernelContext, RuntimeKernelResources } from '../src/core/kernel';

const deps = createFakeRuntimeDeps();

async function runInboundKernel(runtimeConfig: RuntimeConfig, runtimeResources: RuntimeKernelResources): Promise<RuntimeKernelContext> {
  return executeKernelPipeline({
    requestId: 'req_123',
    startedAt: new Date(),
    runtimeConfig,
    runtimeResources,
    inbound: { from: '+15550001111', body: 'hello', fromMe: false },
    handlers: buildDefaultKernelHandlers()
  });
}

describe('runtime kernel executor', () => {
  it('provides explicit default handlers for every kernel phase', () => {
    const handlers = __private.buildDefaultKernelHandlers();

    expect(Object.keys(handlers)).toEqual([...KERNEL_PHASE_ORDER]);
    for (const phase of KERNEL_PHASE_ORDER) {
      expect(typeof handlers[phase]).toBe('function');
    }
  });

  it('inbound kernel executes all declared phases in KERNEL_PHASE_ORDER', async () => {
    const context = await runInboundKernel({
      prompt: 'hi',
      language: 'en',
    }, {
      transport: deps.transport,
      llm: deps.llm,
      stt: deps.stt,
      tts: deps.tts,
      storage: deps.storage,
      vectors: deps.vectors,
      database: deps.database,
      telemetry: deps.telemetry
    });

    const executedPhases = Object.keys(context.telemetry.phaseDurationsMs);
    expect(executedPhases).toEqual([...KERNEL_PHASE_ORDER]);
    for (const phase of KERNEL_PHASE_ORDER) {
      expect(context.telemetry.phaseDurationsMs[phase]).toBeTypeOf('number');
    }
  });
});
