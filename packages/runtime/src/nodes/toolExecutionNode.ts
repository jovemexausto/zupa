import { defineNode } from '@zupa/engine';
import {
    type RuntimeEngineContext,
    type AgentContext,
    type ActiveSession,
    dispatchToolCall,
    withTimeout,
    retryIdempotent
} from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * tool_execution_node
 * TODO: Write better docs.
 */
export const toolExecutionNodeNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
    const { resources, state, config } = context;
    const llmResponse = state.llmResponse;
    const tools = config.tools || [];

    if (!llmResponse || !llmResponse.toolCalls.length || !state.user || !state.session || !state.replyTarget) {
        return { stateDiff: {}, nextTasks: ['response_finalize'] };
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
            await resources.database.endSession(state.session!.id, 'Session ended during tool execution');
        }
    };

    const toolResults: Array<{ toolCallId: string; result: string }> = [];
    for (const toolCall of llmResponse.toolCalls) {
        const result = await withTimeout({
            timeoutMs: config.toolTimeoutMs ?? 10_000,
            label: `Tool '${toolCall.name}'`,
            run: () => retryIdempotent({
                maxRetries: config.maxIdempotentRetries ?? 2,
                baseDelayMs: config.retryBaseDelayMs ?? 75,
                jitterMs: config.retryJitterMs ?? 25,
                run: () => dispatchToolCall({ toolCall, tools, context: agentContext })
            })
        });

        resources.logger.debug({
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: result.status
        }, 'Tool execution completed');

        toolResults.push({
            toolCallId: toolCall.id,
            result: result.status === 'ok' ? result.result : result.formatted
        });
    }

    return {
        stateDiff: { toolResults },
        nextTasks: ['llm_node'] // Loop back to LLM for final response or more tools
    };
});
