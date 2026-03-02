import { describe, expect, it, vi } from "vitest";
import {
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_INBOUND,
  FakeDatabaseBackend,
  TEST_USER_FROM,
} from "@zupa/testing";
import { AgentRuntime } from "../src/index";

describe("Zupa Reliability: Idempotency & Resumability", () => {
  it("should be idempotent: subsequent calls with same messageId do nothing", async () => {
    const deps = createFakeRuntimeDeps();
    const llm = deps.llm as FakeLLMProvider;
    const completeSpy = vi.spyOn(llm, "complete");

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    llm.setResponses([createFakeLLMResponse({ content: "Response 1" })]);

    await runtime.start();

    const msgId = "unique-msg-123";
    const inbound = {
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Hi",
      messageId: msgId,
    };

    // Turn 1
    await runtime.runInbound(inbound);
    expect(completeSpy).toHaveBeenCalledTimes(1);

    // Turn 2 (duplicate)
    await runtime.runInbound(inbound);

    // Should STILL have only 1 call to LLM because eventDedupGate caught it
    expect(completeSpy).toHaveBeenCalledTimes(1);

    await runtime.close();
  });

  it("should persist KV state across turns (Durable Scratchpad)", async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({ content: "Turn 1 done" }),
      createFakeLLMResponse({ content: "Turn 2 done" }),
    ]);

    await runtime.start();

    // Turn 1: No KV initially.
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Turn 1",
      messageId: m1,
    });

    const user = await db.findUser(TEST_USER_FROM);
    const session = await db.findActiveSession(user!.id);

    // Let's simulate a tool having written to KV in the checkpoint
    const snapshot1 = await db.getCheckpoint(session!.id);
    expect(snapshot1).toBeDefined();

    // Cast values to include kv for index access
    const values = snapshot1!.values as Record<string, any>;
    values.kv = { "test-key": "test-value" };
    await db.putCheckpoint(session!.id, snapshot1!);

    // Turn 2: Should pick up the KV from the checkpoint
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Turn 2",
      messageId: "m2",
    });

    const snapshot2 = await db.getCheckpoint(session!.id);
    const values2 = snapshot2!.values as Record<string, any>;
    expect(values2.kv).toBeDefined();
    expect(values2.kv["test-key"]).toBe("test-value");

    await runtime.close();
  });
});
const m1 = "m1";
