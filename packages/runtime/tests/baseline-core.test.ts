import { describe, expect, it, vi } from "vitest";
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  FakeSTTProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_INBOUND,
  FakeDatabaseBackend,
  TEST_USER_FROM,
  TEST_USER_ID,
} from "@zupa/testing";
import { AgentRuntime } from "../src/index";

describe("Zupa Baseline Core Functionality", () => {
  it("should complete a baseline text-to-text turn and persist messages", async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([createFakeLLMResponse({ content: "Hello there!" })]);

    await runtime.start();
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Hi",
      messageId: "msg-101",
    });

    const user = await db.findUser(TEST_USER_ID);
    const session = await db.findActiveSession(user!.id);
    const messages = await db.getRecentMessages(session!.id, 10);

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].contentText).toBe("Hi");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].contentText).toBe("Hello there!");

    await runtime.close();
  });

  it("should maintain working memory across multiple turns", async () => {
    const deps = createFakeRuntimeDeps();
    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    // Spy on the LLM complete call to check history
    const completeSpy = vi.spyOn(llm, "complete");

    llm.setResponses([
      createFakeLLMResponse({ content: "Nice to meet you, Marcus!" }),
      createFakeLLMResponse({ content: "Your name is Marcus." }),
    ]);

    await runtime.start();

    // Turn 1
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "My name is Marcus",
      messageId: "msg-201",
    });

    // Turn 2
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "What is my name?",
      messageId: "msg-202",
    });

    // The second call to LLM should have the first turn in messages
    const secondCallArgs = completeSpy.mock.calls[1][0];
    const messages = secondCallArgs.messages;

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m: any) => m.content === "My name is Marcus")).toBe(
      true,
    );

    await runtime.close();
  });

  it("should process audio flow end-to-end (STT -> LLM -> TTS)", async () => {
    const deps = createFakeRuntimeDeps();
    const stt = deps.stt as FakeSTTProvider;
    const transport = deps.transport as FakeMessagingTransport;

    stt.setTranscription("I am feeling great");

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({ content: "Glad to hear that!" }),
    ]);

    await runtime.start();

    // Voice inbound
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      type: "ptt" as any,
      hasMedia: true,
      downloadMedia: async () =>
        ({
          data: Buffer.from("fake-audio"),
          mimetype: "audio/ogg",
          filename: "voice.ogg",
        }) as any,
    });

    // 1. Check STT was used (resolvedContent should be 'I am feeling great')
    const db = deps.database as FakeDatabaseBackend;
    const user = await db.findUser(TEST_USER_ID);
    const session = await db.findActiveSession(user!.id);
    const messages = await db.getRecentMessages(session!.id, 10);
    expect(messages[0].contentText).toBe("I am feeling great");

    // 2. Check TTS was used (outputModality mirroring)
    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(true);
    expect((deps.tts as any).lastRequest?.text).toBe("Glad to hear that!");

    await runtime.close();
  });

  it("should respect user preference for text replies even with voice input", async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    // Pre-create user with text preference
    const user = await db.createUser({
      externalUserId: TEST_USER_ID,
      displayName: "Marcus",
      preferences: { preferredReplyFormat: "text" },
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([createFakeLLMResponse({ content: "Plain text reply." })]);

    await runtime.start();

    // Voice inbound
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      type: "ptt" as any,
      hasMedia: true,
      downloadMedia: async () =>
        ({
          data: Buffer.from("fake-audio"),
          mimetype: "audio/ogg",
          filename: "voice.ogg",
        }) as any,
    });

    const sent = transport.getSentMessages();
    // Should NOT have audio because of preference
    expect(sent.some((m) => !!m.audio)).toBe(false);
    expect(sent[0].text).toBe("Plain text reply.");

    await runtime.close();
  });

  it("should auto-finalize idle sessions based on sessionIdleTimeoutMinutes", async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;

    // Set a short timeout for the test
    const config = createFakeRuntimeConfig();
    config.sessionIdleTimeoutMinutes = 30;

    const runtime = new AgentRuntime({
      runtimeConfig: config,
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({ content: "First reply" }),
      createFakeLLMResponse({ content: "Second reply" }),
    ]);

    await runtime.start();

    // Turn 1
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Hello first turn"
    });

    const user = await db.findUser(TEST_USER_ID);
    const session1 = await db.findActiveSession(user!.id);
    expect(session1).toBeTruthy();

    // Artificially age the session by 60 minutes
    const agedDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    session1!.lastActiveAt = agedDate;
    (db as any).sessions.set(session1!.id, session1!);

    // Turn 2
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      body: "Hello second turn"
    });

    const session2 = await db.findActiveSession(user!.id);
    expect(session2).toBeTruthy();

    // Should be a completely new session ID
    expect(session2!.id).not.toBe(session1!.id);

    await runtime.close();
  });
});
