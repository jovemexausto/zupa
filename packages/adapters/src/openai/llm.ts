import OpenAI from 'openai';
import { zodFunction, zodResponseFormat } from 'openai/helpers/zod';
import {
    type ChatMessage,
    type LLMCompleteOptions,
    type LLMProviderPort,
    type LLMResponse,
    type Tool,
    type ToolCall
} from '@zupa/core';

type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

type OpenAIToolCall = NonNullable<
    OpenAI.Chat.Completions.ChatCompletion['choices'][number]['message']['tool_calls']
>[number];

function toOpenAIMessages(systemPrompt: string, messages: ChatMessage[]): OpenAIMessage[] {
    const mapped: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const message of messages) {
        if (message.role === 'tool') {
            mapped.push({
                role: 'tool',
                content: message.content,
                tool_call_id: message.toolCallId ?? 'tool'
            });
            continue;
        }

        mapped.push({
            role: message.role as 'user' | 'assistant' | 'system',
            content: message.content
        });
    }

    return mapped;
}

function toOpenAITools(tools: Tool[] | undefined): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) {
        return undefined;
    }

    return tools.map((tool) =>
        zodFunction({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        })
    );
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function fromOpenAIToolCalls(toolCalls: OpenAIToolCall[] | undefined): ToolCall[] {
    if (!toolCalls || toolCalls.length === 0) return [];

    return toolCalls
        .filter((call) => call.type === 'function')
        .map((call) => ({
            id: call.id,
            name: call.function.name,
            arguments: parseToolArguments(call.function.arguments)
        }));
}

export class OpenAILLMProvider implements LLMProviderPort {
    private client: OpenAI;

    public constructor(private readonly opts: {
        baseUrl?: string;
        apiKey: string;
        model: string;
        client?: OpenAI;
    }) {
        this.client = opts.client ?? new OpenAI({
            baseURL: opts.baseUrl,
            apiKey: opts.apiKey
        });
    }

    public async complete(options: LLMCompleteOptions): Promise<LLMResponse> {
        const start = Date.now();

        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: this.opts.model,
            messages: toOpenAIMessages(options.systemPrompt, options.messages)
        };

        const tools = toOpenAITools(options.tools);
        if (tools) {
            params.tools = tools;
        }

        if (options.outputSchema) {
            params.response_format = zodResponseFormat(options.outputSchema, 'response');
        }

        const response = await this.client.chat.completions.create(params);
        const choice = response.choices[0]?.message;

        const content = choice?.content ?? '';
        let structured: unknown | null = null;

        if (options.outputSchema) {
            structured = options.outputSchema.parse(JSON.parse(content || '{}'));
        }

        return {
            content: options.outputSchema ? null : content,
            structured,
            toolCalls: fromOpenAIToolCalls(choice?.tool_calls),
            tokensUsed: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0
            },
            model: response.model,
            latencyMs: Date.now() - start
        };
    }
}
