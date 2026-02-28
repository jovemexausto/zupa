import { createAgent } from '../api';
import type { AgentConfig } from '../api';
import { RuntimeKernelResources } from '../core/kernel';
import { OpenAILLMProvider } from '../integrations/llm/openai';
import { OpenAIWhisperSTTProvider } from '../integrations/stt/openai';
import { OpenAITTSProvider } from '../integrations/tts/openai';
import { createFakeRuntimeDeps } from './fakes';

interface WithReply {
  reply: string;
}

export interface OpenAITestingAgentOptions<T extends WithReply = WithReply> {
  prompt: AgentConfig<T>['prompt'];
  apiKey: string;
  ttsVoice: string;
  baseUrl?: string;
  llmModel?: string;
  sttModel?: string;
  ttsModel?: string;
  language?: AgentConfig<T>['language'];
  outputSchema?: AgentConfig<T>['outputSchema'];
  tools?: AgentConfig<T>['tools'];
  commands?: AgentConfig<T>['commands'];
}

export interface OpenAITestingAgentResult<T extends WithReply = WithReply> {
  agent: ReturnType<typeof createAgent<T>>;
  deps: RuntimeKernelResources;
}

export function createOpenAITestingAgent<T extends WithReply = WithReply>(
  options: OpenAITestingAgentOptions<T>
): OpenAITestingAgentResult<T> {
  const llmModel = options.llmModel ?? 'gpt-4o-mini';
  const sttModel = options.sttModel ?? 'whisper-1';
  const ttsModel = options.ttsModel ?? 'gpt-4o-mini-tts';
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  const deps = createFakeRuntimeDeps();
  deps.llm = new OpenAILLMProvider({
    apiKey: options.apiKey,
    baseUrl,
    model: llmModel
  });
  deps.stt = new OpenAIWhisperSTTProvider({
    apiKey: options.apiKey,
    baseUrl,
    model: sttModel
  });
  deps.tts = new OpenAITTSProvider({
    apiKey: options.apiKey,
    baseUrl,
    model: ttsModel,
    voice: options.ttsVoice
  });

  const config: AgentConfig<T> = {
    prompt: options.prompt,
    providers: {
      llm       : deps.llm,
      stt       : deps.stt,
      tts       : deps.tts,
      transport : deps.transport,
      storage   : deps.storage,
      vectors   : deps.vectors,
      database  : deps.database
    }
  };

  if (options.language !== undefined) {
    config.language = options.language;
  }
  if (options.outputSchema !== undefined) {
    config.outputSchema = options.outputSchema;
  }
  if (options.tools !== undefined) {
    config.tools = options.tools;
  }
  if (options.commands !== undefined) {
    config.commands = options.commands;
  }

  return {
    agent: createAgent(config),
    deps
  };
}
