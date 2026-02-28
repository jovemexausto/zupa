import { describe, expect, it, vi } from 'vitest';
import {
  createFakeRuntimeDeps,
  DEFAULT_SESSION
} from '@zupa/testing';
import { GraphKVStore } from '@zupa/core';
import { endSessionWithKvHandoff } from '../src/index';

describe('session capability slice', () => {
  it('GraphKVStore gets, sets and deletes cleanly', async () => {
    const store = {};
    const kv = new GraphKVStore(store);

    await kv.set('name', 'voxpal');
    await kv.set('count', 2);
    await kv.delete('name');

    expect(await kv.get('count')).toBe(2);
    expect(await kv.all()).toEqual({ count: 2 });
  });

  it('GraphKVStore supports nested JSON objects and arrays', async () => {
    const store = {};
    const kv = new GraphKVStore(store);

    await kv.set('tags', ['a', 'b', 'c']);
    await kv.set('meta', { x: 1, nested: { y: true } });

    expect(await kv.get('tags')).toEqual(['a', 'b', 'c']);
    expect(await kv.get('meta')).toEqual({ x: 1, nested: { y: true } });
  });

  it('GraphKVStore rejects non-JSON values', async () => {
    const store = {};
    const kv = new GraphKVStore(store);

    await expect(kv.set('fn', (() => { }) as never)).rejects.toThrow(TypeError);
    await expect(kv.set('undef', undefined as never)).rejects.toThrow(TypeError);
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
