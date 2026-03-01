import {
  FakeLLMProvider,
  FakeSTTProvider,
  FakeTTSProvider,
  FakeMessagingTransport,
  FakeDatabaseBackend,
  FakeFileStorage,
  FakeVectorStore,
  FakeLogger,
} from "@zupa/adapters";
import {
  type RuntimeEngineResources,
  type User,
  type Session,
  type InboundMessage,
  type RuntimeConfig,
  type LLMResponse,
  resolveLanguage,
} from "@zupa/core";

export {
  FakeLLMProvider,
  FakeSTTProvider,
  FakeTTSProvider,
  FakeMessagingTransport,
  FakeDatabaseBackend,
  FakeFileStorage,
  FakeVectorStore,
  FakeLogger,
};

export const TEST_USER_FROM = "5511999999999@c.us";
export const TEST_USER_ID = "+5511999999999";

export const DEFAULT_USER: User = {
  id: "u1",
  externalUserId: "user123",
  displayName: "Test User",
  preferences: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  lastActiveAt: new Date("2026-01-01T00:00:00Z"),
};

export const DEFAULT_SESSION: Session = {
  id: "s1",
  userId: "u1",
  startedAt: new Date("2026-01-01T00:00:00Z"),
  endedAt: null,
  summary: null,
  messageCount: 0,
  metadata: {},
};

export const DEFAULT_INBOUND: InboundMessage = {
  messageId: "test-msg-001",
  from: "user123",
  body: "hello",
};

export function createFakeRuntimeConfig(
  overrides?: Partial<RuntimeConfig>,
): RuntimeConfig {
  return {
    language: resolveLanguage("en"),
    prompt: "You are a helpful assistant",
    maxToolIterations: 3,
    maxWorkingMemory: 20,
    maxEpisodicMemory: 3,
    semanticSearchLimit: 3,
    rateLimitPerUserPerMinute: 20,
    maxIdempotentRetries: 2,
    retryBaseDelayMs: 75,
    retryJitterMs: 25,
    maxInboundConcurrency: 32,
    overloadMessage: "Busy",
    sessionIdleTimeoutMinutes: 30,
    toolTimeoutMs: 12000,
    llmTimeoutMs: 20000,
    sttTimeoutMs: 15000,
    ttsTimeoutMs: 15000,
    ttsVoice: "alloy",
    fallbackReply: "Error",
    preferredVoiceReply: false,
    ui: { enabled: false },
    ...overrides,
  };
}

export function createFakeLLMResponse(
  overrides?: Partial<LLMResponse>,
): LLMResponse {
  return {
    content: "Fake response",
    structured: null,
    toolCalls: [],
    tokensUsed: { promptTokens: 0, completionTokens: 0 },
    model: "fake-model",
    latencyMs: 10,
    ...overrides,
  };
}

export function createFakeRuntimeDeps(): RuntimeEngineResources {
  const database = new FakeDatabaseBackend();

  return {
    transport: new FakeMessagingTransport(),
    llm: new FakeLLMProvider([
      createFakeLLMResponse({ structured: { reply: "ok" } }),
    ]),
    stt: new FakeSTTProvider(),
    tts: new FakeTTSProvider(),
    storage: new FakeFileStorage(),
    vectors: new FakeVectorStore(),
    telemetry: { emit() {} },
    database,
    logger: new FakeLogger(),
  };
}
