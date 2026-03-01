import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext, type LLMResponse, type AgentContext, type ActiveSession } from '@zupa/core';
import { type RuntimeState } from './index';
import { executeTools } from './utils/executeTools';
import { finalizeResponse } from '@zupa/core';

/**
 * interactive_streaming_node
 * 
 * Handles the "streaming" finalization strategy for UI channels.
 * It autonomously loops between LLM generation and Tool Execution 
 * without yielding back to the main Pregel graph until a final 
 * text response is produced. It pipes tokens directly to the connected client.
 */
export const interactiveStreamingNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
    const { resources, state, config } = context;
    const { reactiveUi } = resources;
    const clientId = context.inbound.clientId;

    if (!clientId || !reactiveUi || !resources.llm.stream) {
        throw new Error('Streaming node invoked without reactive UI or streaming LLM capability');
    }

    if (!state.user || !state.session || !state.replyTarget) {
        return { stateDiff: {}, nextTasks: ['persistence_hooks'] };
    }

    const agentContext: AgentContext<unknown> = {
        user: state.user,
        session: state.session as ActiveSession,
        inbound: context.inbound,
        language: config.language,
        replyTarget: state.replyTarget,
        resources,
        config,
        endSession: async () => {
            await resources.database.endSession(state.session!.id, 'Session ended during streaming interaction');
        }
    };

    let history = [...(state.assembledContext?.history || [])];
    const systemPrompt = state.builtPrompt!;
    let finalLlmResponse: LLMResponse | undefined;
    const allToolResults: Array<{ toolCallId: string; result: string }> = [];

    // Autonomous Loop: Stream -> Execute Tools -> Stream
    while (true) {
        const stream = resources.llm.stream({
            messages: history.map(m => ({ role: m.role, content: m.contentText })),
            systemPrompt,
            outputSchema: config.outputSchema,
            tools: config.tools
        });

        let chunkResponse: LLMResponse | undefined;

        for await (const chunk of stream) {
            // End of stream yields the final LLMResponse object instead of a chunk
            if ('toolCalls' in chunk && 'structured' in chunk && 'content' in chunk) {
                chunkResponse = chunk as unknown as LLMResponse;
                break;
            }

            // Normal chunk
            reactiveUi.emitTokenChunk(clientId, {
                id: (chunk as any).id || 'unknown',
                content: (chunk as any).content || ''
            });

            // If the user disconnected, we abort the stream
            // (Assuming there was an abort signal or state check here in reality)
            // if (context.inbound.abortSignal?.aborted) break;
        }

        if (!chunkResponse) {
            throw new Error('LLM stream finished without returning a final response object');
        }

        // Did the LLM call tools?
        if (chunkResponse.toolCalls && chunkResponse.toolCalls.length > 0) {
            // Execute them immediately
            const toolResults = await executeTools({
                toolCalls: chunkResponse.toolCalls,
                tools: config.tools || [],
                agentContext,
                logger: resources.logger,
                toolTimeoutMs: config.toolTimeoutMs,
                maxIdempotentRetries: config.maxIdempotentRetries,
                retryBaseDelayMs: config.retryBaseDelayMs,
                retryJitterMs: config.retryJitterMs
            });

            allToolResults.push(...toolResults);

            // Append the tool calls and their results to our local `history` array
            // so the next loop iteration feeds them back to the LLM.

            // 1. Append the Assistant's tool request
            history.push({
                id: `msg-assistant-${Date.now()}`,
                sessionId: state.session.id,
                userId: state.user.id,
                role: 'assistant',
                contentText: chunkResponse.content || '',
                inputModality: 'text',
                outputModality: 'text',
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
                latencyMs: 0,
                metadata: {},
                createdAt: new Date()
            });

            // 2. Append the tool results
            for (const res of toolResults) {
                history.push({
                    id: `msg-tool-${res.toolCallId}-${Date.now()}`,
                    sessionId: state.session.id,
                    userId: state.user.id,
                    role: 'system',
                    contentText: `Tool ${res.toolCallId} result: ${res.result}`,
                    inputModality: 'text',
                    outputModality: 'text',
                    tokensUsed: { promptTokens: 0, completionTokens: 0 },
                    latencyMs: 0,
                    metadata: {},
                    createdAt: new Date()
                });
            }

            // Loop continues...
        } else {
            // No more tools, we have a final text response.
            finalLlmResponse = chunkResponse;
            break;
        }
    }

    // Call user-provided callbacks if any
    if (config.onResponse) {
        try {
            await config.onResponse(finalLlmResponse, agentContext);
        } catch (err) {
            resources.logger.error({ err }, 'Error in onResponse callback');
        }
    }

    // Fallback if the user prefers voice even though it was a UI channel
    const prefersVoice = config.preferredVoiceReply === true || state.inputModality === 'voice';
    let outputModality: 'text' | 'voice' = 'text';

    if (prefersVoice && finalLlmResponse.content) {
        const result = await finalizeResponse({
            input: {
                replyTarget: state.replyTarget,
                replyText: finalLlmResponse.content,
                preferredVoiceReply: config.preferredVoiceReply ?? false,
                userId: state.user.id,
                sessionId: state.session.id
            },
            ttsProvider: resources.tts,
            messaging: resources.transport,
            config: {
                ttsVoice: config.ttsVoice ?? 'alloy',
                agentLanguage: config.language,
                ...(config.ttsTimeoutMs !== undefined && { ttsTimeoutMs: config.ttsTimeoutMs }),
                ...(config.maxIdempotentRetries !== undefined && { maxIdempotentRetries: config.maxIdempotentRetries }),
                ...(config.retryBaseDelayMs !== undefined && { retryBaseDelayMs: config.retryBaseDelayMs }),
                ...(config.retryJitterMs !== undefined && { retryJitterMs: config.retryJitterMs })
            }
        });
        outputModality = result.outputModality;
    } else if (finalLlmResponse.content) {
        // Technically for a UI channel we've ALREADY streamed the text to them.
        // We might not need to `transport.sendText` at all if `ui_channel` implies no transport send,
        // but we'll do it to maintain parity with responseFinalize unless `ui_channel` ignores it.
        await resources.transport.sendText(state.replyTarget, finalLlmResponse.content);
    }

    return {
        stateDiff: {
            llmResponse: finalLlmResponse,
            toolResults: allToolResults.length > 0 ? allToolResults : undefined,
            outputModality
        },
        nextTasks: ['persistence_hooks']
    };
});
