import { defineNode } from '@zupa/engine';
import {
    type RuntimeEngineContext,
    type AgentContext,
    type ActiveSession
} from '@zupa/core';
import { executeTools } from './utils/executeTools';
import { RuntimeState } from '.';

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

    const toolResults = await executeTools({
        toolCalls: llmResponse.toolCalls,
        tools,
        agentContext,
        logger: resources.logger,
        toolTimeoutMs: config.toolTimeoutMs,
        maxIdempotentRetries: config.maxIdempotentRetries,
        retryBaseDelayMs: config.retryBaseDelayMs,
        retryJitterMs: config.retryJitterMs
    });

    return {
        stateDiff: { toolResults },
        nextTasks: ['llm_node'] // Loop back to LLM for final response or more tools
    };
});
