import { describe, expect, it, vi } from "vitest";
import {
  FakeMessagingTransport,
  FakeLLMProvider,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  createFakeLLMResponse,
  DEFAULT_INBOUND,
  FakeDatabaseBackend,
  TEST_USER_FROM,
} from "@zupa/testing";
import { AgentRuntime } from "../src/index";

describe("Enhanced Modality Preferences", () => {
  it('should respect "text" preference regardless of input modality', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    await db.createUser({
      externalUserId: TEST_USER_FROM,
      displayName: "User",
      preferences: { preferredReplyFormat: "text" },
    });

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([createFakeLLMResponse({ content: "Text reply" })]);

    await runtime.start();
    // Voice input
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      from: TEST_USER_FROM,
      type: "ptt" as any,
      hasMedia: true,
      downloadMedia: async () =>
        ({
          data: Buffer.from("audio"),
          mimetype: "audio/ogg",
          filename: "v.ogg",
        }) as any,
    });

    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(false);
    expect(sent[0]!.text).toBe("Text reply");
    await runtime.close();
  });

  it('should respect "voice" preference even with text input', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    await db.createUser({
      externalUserId: TEST_USER_FROM,
      displayName: "User",
      preferences: { preferredReplyFormat: "voice" },
    });

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([createFakeLLMResponse({ content: "Voice reply" })]);

    await runtime.start();
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "mod-" + 1,
      from: TEST_USER_FROM,
      body: "Hi",
    });

    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(true);
    await runtime.close();
  });

  it('should respect "mirror" preference (default behavior)', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({ content: "Text for text" }),
      createFakeLLMResponse({ content: "Voice for voice" }),
    ]);

    await runtime.start();

    // 1. Text -> Text
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-3",
      from: TEST_USER_FROM,
      body: "Text input",
    });
    const textSent = transport.getSentMessages();
    expect(textSent[textSent.length - 1]!.audio).toBeUndefined();

    // 2. Voice -> Voice
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-4",
      from: TEST_USER_FROM,
      type: "ptt" as any,
      hasMedia: true,
      downloadMedia: async () =>
        ({
          data: Buffer.from("audio"),
          mimetype: "audio/ogg",
          filename: "v.ogg",
        }) as any,
    });
    const voiceSent = transport.getSentMessages();
    expect(voiceSent[voiceSent.length - 1]!.audio).toBeDefined();

    await runtime.close();
  });

  it('should handle "dynamic" mode with LLM structured signal', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    await db.createUser({
      externalUserId: TEST_USER_FROM,
      displayName: "User",
      preferences: { preferredReplyFormat: "dynamic" },
    });

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    // LLM explicitly requests voice in structured data
    llm.setResponses([
      createFakeLLMResponse({
        content: "I am speaking now",
        structured: { reply: "I am speaking now", modality: "voice" },
      }),
    ]);

    await runtime.start();
    // Text input but LLM wants voice
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-5",
      from: TEST_USER_FROM,
      body: "Send me audio",
    });

    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(true);
    await runtime.close();
  });

  it('should handle "dynamic" mode with keyword heuristic fallback', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    await db.createUser({
      externalUserId: TEST_USER_FROM,
      displayName: "User",
      preferences: { preferredReplyFormat: "dynamic" },
    });

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([
      createFakeLLMResponse({ content: "Heuristic voice reply" }),
    ]);

    await runtime.start();
    // Text input explicitly asking for audio
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-6",
      from: TEST_USER_FROM,
      body: "Me manda um áudio",
    });

    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(true);
    await runtime.close();
  });

  it('should respect agent-level "modality" enforcer over user preference', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;
    const transport = deps.transport as FakeMessagingTransport;

    // User wants voice
    await db.createUser({
      externalUserId: TEST_USER_FROM,
      displayName: "User",
      preferences: { preferredReplyFormat: "voice" },
    });

    const runtime = new AgentRuntime({
      runtimeConfig: {
        ...createFakeRuntimeConfig(),
        modality: "text", // Agent enforcer: Only text
      },
      runtimeResources: deps,
    });

    const llm = deps.llm as FakeLLMProvider;
    llm.setResponses([createFakeLLMResponse({ content: "Enforced text" })]);

    await runtime.start();
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "mod-" + 2,
      from: TEST_USER_FROM,
      body: "Hi",
    });

    const sent = transport.getSentMessages();
    expect(sent.some((m) => !!m.audio)).toBe(false);
    expect(sent[0]!.text).toBe("Enforced text");
    await runtime.close();
  });

  it("should support slash commands to toggle preference", async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database as FakeDatabaseBackend;

    const runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig(),
      runtimeResources: deps,
    });

    await runtime.start();

    // Turn 1: Switch to voice via command
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-8",
      from: TEST_USER_FROM,
      body: "/voice",
    });

    // Find by externalUserId
    let user = await db.findUser(TEST_USER_FROM);
    expect(user!.preferences.preferredReplyFormat).toBe("voice");

    // Turn 2: Switch to dynamic
    await runtime.runInbound({
      ...DEFAULT_INBOUND,
      messageId: "modality-9",
      from: TEST_USER_FROM,
      body: "/dynamic",
    });

    user = await db.findUser(TEST_USER_FROM);
    expect(user!.preferences.preferredReplyFormat).toBe("dynamic");

    await runtime.close();
  });
});
