import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineNode } from '../src/index';
import { type AgentContext } from '@zupa/core';
import { createFakeRuntimeDeps } from '@zupa/testing';

describe('Node Contract (via defineNode)', () => {
  it('validates input/output matching the schema', async () => {
    interface TestState { input: number; result?: number }

    const node = defineNode<TestState, { state: TestState }>(async (ctx) => {
      const state = ctx.state;
      return {
        stateDiff: { result: state.input * 2 },
        nextTasks: []
      };
    });

    const context = {
      state: { input: 21 }
    };

    const res = await node(context);
    expect(res?.stateDiff?.result).toBe(42);
  });
});
