import { describe, expect, it, vi } from "vitest";
import { EngineExecutor, createInitialRuntimeContext } from "../src/index";
import { createFakeRuntimeDeps, createFakeRuntimeConfig } from "@zupa/testing";
import { type Checkpointer, type Ledger } from "@zupa/core";

const createMockSaver = (): Checkpointer<any> & Ledger => ({
  putCheckpoint: vi.fn(async () => {}),
  getCheckpoint: vi.fn(async () => null),
  getCheckpointById: vi.fn(async () => null),
  getCheckpointHistory: vi.fn(async () => []),
  appendLedgerEvent: vi.fn(async () => {}),
  start: async () => {},
  close: async () => {},
});

describe("EngineExecutor (Pregel)", () => {
  it("should execute the graph correctly", async () => {
    const deps = createFakeRuntimeDeps();
    const executor = new EngineExecutor({
      channels: {
        ok: (prev: boolean | undefined, update: boolean) => update,
      },
      nodes: {
        start: async (_ctx) => ({ stateDiff: { ok: true }, nextTasks: [] }),
      },
    });

    const context = createInitialRuntimeContext({
      requestId: "r1",
      startedAt: new Date(),
      inbound: { messageId: "m1", from: "u1", body: "hi", source: "transport" },
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
      logger: deps.logger as any,
    });

    const mockPersistence = createMockSaver();
    const result = await executor.invoke({}, context, {
      threadId: "t1",
      checkpointer: mockPersistence as Checkpointer<any>,
      ledger: mockPersistence as Ledger,
      entrypoint: "start",
    });

    expect(result).toBeDefined();
    expect(result.values.ok).toBe(true);
  });
});
