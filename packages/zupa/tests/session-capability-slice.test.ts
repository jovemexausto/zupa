import { describe, expect, it, vi } from 'vitest';

import { SessionKVStore } from '../src/capabilities/session/kv';
import { endSessionWithKvHandoff } from '../src/capabilities/session/sessionLifecycle';

describe('session capability slice', () => {
  it('persists kv immediately on write/delete operations', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const kv = new SessionKVStore(
      's1',
      {
        updateSessionKV: async (_sessionId, snapshot) => {
          writes.push({ ...snapshot });
        }
      },
      {}
    );

    await kv.set('name', 'voxpal');
    await kv.set('count', 2);
    await kv.delete('name');

    expect(await kv.get('count')).toBe(2);
    expect(await kv.all()).toEqual({ count: 2 });
    expect(writes).toEqual([{ name: 'voxpal' }, { name: 'voxpal', count: 2 }, { count: 2 }]);
  });

  it('hands off kv snapshot when ending the active session', async () => {
    const endSessionWithSummary = vi.fn(async () => {
      return;
    });

    await endSessionWithKvHandoff({
      session: {
        id: 's1',
        kv: {
          get: async () => null,
          set: async () => {
            return;
          },
          delete: async () => {
            return;
          },
          all: async () => ({ correctionCount: 3 })
        }
      },
      endedAt: new Date('2026-02-24T00:00:00.000Z'),
      sessionManager: {
        endSessionWithSummary
      }
    });

    expect(endSessionWithSummary).toHaveBeenCalledWith('s1', new Date('2026-02-24T00:00:00.000Z'), {
      correctionCount: 3
    });
  });
});
