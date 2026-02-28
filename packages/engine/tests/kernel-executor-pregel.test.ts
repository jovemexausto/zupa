import { describe, expect, it, vi } from 'vitest';
import { KernelExecutor, createInitialRuntimeContext } from '../src/index';
import { createFakeRuntimeDeps, createFakeRuntimeConfig } from '@zupa/testing';
import { type StateSnapshot, type CheckpointSaver, type LedgerWriter, type LedgerEvent } from '@zupa/core';

const createMockSaver = (): CheckpointSaver<any> & LedgerWriter => ({
    putCheckpoint: vi.fn(async () => { }),
    getCheckpoint: vi.fn(async () => null),
    getCheckpointById: vi.fn(async () => null),
    getCheckpointHistory: vi.fn(async () => []),
    appendLedgerEvent: vi.fn(async () => { })
});

describe('KernelExecutor (Pregel)', () => {
    it('should execute the graph correctly', async () => {
        const deps = createFakeRuntimeDeps();
        const executor = new KernelExecutor({
            channels: {
                ok: (prev: boolean | undefined, update: boolean) => update
            },
            nodes: {
                start: async (_ctx) => ({ stateDiff: { ok: true }, nextTasks: [] })
            }
        });

        const context = createInitialRuntimeContext({
            requestId: 'r1',
            startedAt: new Date(),
            inbound: { from: 'u1', body: 'hi', fromMe: false },
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps
        });

        const result = await executor.invoke(
            {},
            context,
            {
                threadId: 't1',
                saver: createMockSaver() as CheckpointSaver<any> & LedgerWriter,
                entrypoint: 'start'
            }
        );

        expect(result).toBeDefined();
        expect(result.values.ok).toBe(true);
    });
});
