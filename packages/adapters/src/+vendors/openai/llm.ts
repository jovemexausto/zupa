import OpenAI from 'openai';
import { zodFunction, zodResponseFormat } from 'openai/helpers/zod';
import {
    type ChatMessage,
    type LLMCompleteOptions,
    type LLMProvider,
    type LLMResponse,
    type LLMStreamChunk,
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

export class OpenAILLMProvider implements LLMProvider {
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

    public async *stream(options: LLMCompleteOptions): AsyncGenerator<LLMStreamChunk, LLMResponse, unknown> {
        const start = Date.now();

        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: this.opts.model,
            messages: toOpenAIMessages(options.systemPrompt, options.messages),
            stream: true,
            stream_options: { include_usage: true }
        };

        const tools = toOpenAITools(options.tools);
        if (tools) {
            params.tools = tools;
        }

        const stream = await this.client.chat.completions.create(params);

        let fullContent = '';
        let model = this.opts.model;
        let promptTokens = 0;
        let completionTokens = 0;

        const accumulatedToolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const content = choice?.delta?.content || '';
            const toolCallsDelta = choice?.delta?.tool_calls;

            if (content) {
                fullContent += content;
                yield { id: chunk.id, content };
            }

            if (toolCallsDelta && toolCallsDelta.length > 0) {
                for (const tc of toolCallsDelta) {
                    const index = tc.index;
                    if (!accumulatedToolCalls[index]) {
                        accumulatedToolCalls[index] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
                    }
                    if (tc.function?.arguments) {
                        accumulatedToolCalls[index].arguments += tc.function.arguments;
                    }

                    yield {
                        id: chunk.id,
                        content: '',
                        toolCallDelta: {
                            index,
                            id: tc.id,
                            name: tc.function?.name,
                            arguments: tc.function?.arguments || ''
                        }
                    };
                }
            }

            if (chunk.model) {
                model = chunk.model;
            }
            if (chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens;
                completionTokens = chunk.usage.completion_tokens;
            }
        }

        const finalToolCalls: ToolCall[] = Object.values(accumulatedToolCalls).map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: parseToolArguments(tc.arguments)
        }));

        return {
            content: fullContent,
            structured: null, // Streaming structured output is not supported yet
            toolCalls: finalToolCalls,
            tokensUsed: {
                promptTokens,
                completionTokens
            },
            model,
            latencyMs: Date.now() - start
        };
    }
}
