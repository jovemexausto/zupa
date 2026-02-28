import { FakeLLMProvider } from '../integrations/llm/fake';
import { FakeSTTProvider } from '../integrations/stt/fake';
import { FakeTTSProvider } from '../integrations/tts/fake';
import { FakeDatabaseBackend } from '../integrations/database/fake';
import { FakeFileStorage } from '../integrations/storage/fake';
import { FakeVectorStore } from '../integrations/vectors/fake';
import { FakeMessagingTransport } from '../integrations/transport/fake';
import { RuntimeKernelResources } from '../core/kernel';

export { FakeLLMProvider, FakeSTTProvider, FakeTTSProvider, FakeMessagingTransport, FakeDatabaseBackend, FakeFileStorage, FakeVectorStore };

export function createFakeRuntimeDeps(): RuntimeKernelResources {
  const database = new FakeDatabaseBackend();

  return {
    transport: new FakeMessagingTransport(),
    llm: new FakeLLMProvider([
      {
        content: null,
        structured: { reply: 'ok' },
        toolCalls: [],
        tokensUsed: { promptTokens: 0, completionTokens: 0 },
        model: 'fake',
        latencyMs: 1
      }
    ]),
    stt: new FakeSTTProvider(),
    tts: new FakeTTSProvider(),
    storage: new FakeFileStorage(),
    vectors: new FakeVectorStore(),
    telemetry: { emit(){} },
    database
  };
}
