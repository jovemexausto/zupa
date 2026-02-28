import { FakeDatabaseBackend } from './database/fake';
import { FakeFileStorage } from './storage/fake';
import { FakeVectorStore } from './vectors/fake';
import { FakeMessagingTransport } from './transport/fake';
import { createWWebJSTransport } from './transport/wwebjs';

import { OpenAILLMProvider } from './llm/openai';
import { OpenAIWhisperSTTProvider } from './stt/openai';
import { OpenAITTSProvider } from './tts/openai';
import { RuntimeKernelResources } from '../core/kernel';

interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
}

interface OpenAILLMFactoryOptions extends OpenAIProviderOptions {
  model?: string;
}

interface OpenAISTTFactoryOptions extends OpenAIProviderOptions {
  model?: string;
}

interface OpenAITTSFactoryOptions extends OpenAIProviderOptions {
  voice?: string;
  model?: string;
}

function resolveOpenAIApiKey(input?: string): string {
  const apiKey = input ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Error('Missing OPENAI_API_KEY environment variable.');
  }

  return apiKey;
}

export const integrations = {
  llm: {
    openai(options: OpenAILLMFactoryOptions = {}) {
      const apiKey  = resolveOpenAIApiKey(options.apiKey);
      const model   = options.model ?? 'gpt-5-mini';
      const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

      return new OpenAILLMProvider({ model, apiKey, baseUrl });
    }
  },
  stt: {
    whisper(options: OpenAISTTFactoryOptions = {}) {
      const apiKey  = resolveOpenAIApiKey(options.apiKey);
      const model   = options.model ?? 'whisper-1';
      const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

      return new OpenAIWhisperSTTProvider({ model, apiKey, baseUrl });
    }
  },
  tts: {
    openai(options: OpenAITTSFactoryOptions = {}) {
      const apiKey  = resolveOpenAIApiKey(options.apiKey);
      const voice   = options.voice ?? 'alloy';
      const model   = options.model ?? 'gpt-4o-mini-tts';
      const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

      return new OpenAITTSProvider({ voice, model, apiKey, baseUrl });
    }
  },
  transport: {
    fake() {
      return new FakeMessagingTransport();
    },
    wwebjs(options?: Parameters<typeof createWWebJSTransport>[0]) {
      return createWWebJSTransport(options);
    }
  },
  storage: {
    fake() {
      return new FakeFileStorage();
    }
  },
  vectors: {
    fake() {
      return new FakeVectorStore();
    }
  },
  database: {
    fake() {
      return new FakeDatabaseBackend();
    }
  }
};

export function createLocalIntegrations(): RuntimeKernelResources {
  return {
    llm       : integrations.llm.openai(),
    stt       : integrations.stt.whisper(),
    tts       : integrations.tts.openai(),
    transport : integrations.transport.wwebjs(),
    storage   : integrations.storage.fake(),
    vectors   : integrations.vectors.fake(),
    database  : integrations.database.fake(),
    telemetry : { emit(e) { console.log(JSON.stringify(e)) } }
  };
}
