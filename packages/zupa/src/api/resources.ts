import {
    type RuntimeKernelResources
} from '@zupa/core';
import {
    OpenAILLMProvider,
    OpenAIWhisperSTTProvider,
    OpenAITTSProvider,
    createWWebJSTransport,
    FakeFileStorage,
    FakeVectorStore,
    FakeDatabaseBackend
} from '@zupa/adapters';

/**
 * Creates a default set of resources using OpenAI and local fakes.
 * This is the high-level convenience factory for the main SDK.
 */
export function createLocalResources(): RuntimeKernelResources {
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    return {
        llm: new OpenAILLMProvider({
            apiKey,
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
        }),
        stt: new OpenAIWhisperSTTProvider({
            apiKey
        }),
        tts: new OpenAITTSProvider({
            apiKey
        }),
        transport: createWWebJSTransport(),
        storage: new FakeFileStorage(),
        vectors: new FakeVectorStore(),
        database: new FakeDatabaseBackend(),
        telemetry: {
            emit(e) {
                // Default telemetry just logs to console for now
                if (process.env.NODE_ENV !== 'test') {
                    console.log(`[Telemetry] ${e.node}: ${e.durationMs}ms`);
                }
            }
        }
    };
}
