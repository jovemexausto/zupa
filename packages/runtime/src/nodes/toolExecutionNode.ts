import { defineNode } from '@zupa/engine';
import {
    type RuntimeKernelContext,
    type AgentContext,
    type SessionWithKV,
    dispatchToolCall
} from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * tool_execution_node
 */
export const toolExecutionNodeNode = defineNode<RuntimeState, RuntimeKernelContext>(async (context) => {
    const { resources, state, config } = context;
    const llmResponse = state.llmResponse;
    const tools = config.tools || [];

    if (!llmResponse || !llmResponse.toolCalls.length || !state.user || !state.session || !state.replyTarget) {
        return { stateDiff: {}, nextTasks: ['response_finalize'] };
    }

    const agentContext: AgentContext<unknown> = {
        user: state.user,
        session: state.session as SessionWithKV,
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
        const result = await dispatchToolCall({ toolCall, tools, context: agentContext });
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
