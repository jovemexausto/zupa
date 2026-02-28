import { describe, expect, it } from 'vitest';

import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { KERNEL_PHASE_ORDER, createInitialRuntimeContext } from '../src/core/kernel';

const deps = createFakeRuntimeDeps();

describe('runtime context contracts', () => {
  it('defines kernel phase order explicitly and deterministically', () => {
    expect(KERNEL_PHASE_ORDER).toEqual([
      'access_policy',
      'session_attach',
      'command_dispatch_gate',
      'content_resolution',
      'context_assembly',
      'prompt_build',
      'agentic_loop',
      'response_finalize',
      'persistence_hooks',
      'telemetry_emit'
    ]);
  });

  it('creates a context with stable metadata and empty mutable phase state', () => {
    const startedAt = new Date('2026-02-24T00:00:00.000Z');
    const context = createInitialRuntimeContext({
      requestId: 'req_123',
      startedAt,
      inbound: {
        from: '15551234567',
        body: 'hello',
        fromMe: false,
      },
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

    expect(context.meta.requestId).toBe('req_123');
    expect(context.meta.startedAt).toBe(startedAt);
    expect(context.inbound).toEqual({ from: '15551234567', body: 'hello', fromMe: false });
    expect(Object.prototype.hasOwnProperty.call(context.config, 'llm')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(context.config, 'stt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(context.config, 'tts')).toBe(false);
    expect(context.resources.database).toBe(deps.database);
    expect(context.state).toEqual({});
    expect(context.telemetry.phaseDurationsMs).toEqual({});
  });
});
