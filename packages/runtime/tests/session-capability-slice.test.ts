import { describe, expect, it, vi } from 'vitest';
import {
  createFakeRuntimeDeps,
  DEFAULT_SESSION
} from '@zupa/testing';
import { MemoryStateProvider } from '@zupa/core';
import { endSessionWithKvHandoff } from '../src/index';

describe('session capability slice', () => {
  it('memory state provider gets, sets and deletes cleanly', async () => {
    const provider = new MemoryStateProvider();
    const kv = provider.attach(DEFAULT_SESSION.id);

    await kv.set('name', 'voxpal');
    await kv.set('count', 2);
    await kv.delete('name');

    expect(await kv.get('count')).toBe(2);
    expect(await kv.all()).toEqual({ count: 2 });
  });

  it('hands off kv snapshot when ending the active session', async () => {
    const endSessionWithSummary = vi.fn(async () => {
      return;
    });

    await endSessionWithKvHandoff({
      session: {
        id: DEFAULT_SESSION.id,
        kv: {
          all: async () => ({ correctionCount: 3 })
        }
      },
      endedAt: new Date('2026-02-24T00:00:00.000Z'),
      sessionManager: {
        endSessionWithSummary
      }
    });

    expect(endSessionWithSummary).toHaveBeenCalledWith(
      DEFAULT_SESSION.id,
      new Date('2026-02-24T00:00:00.000Z'),
      JSON.stringify({ correctionCount: 3 })
    );
  });
});
