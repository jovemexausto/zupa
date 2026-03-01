import {
    type AgentContext,
    type ToolCall,
    type Tool,
    dispatchToolCall,
    withTimeout,
    retryIdempotent,
    Logger
} from '@zupa/core';

export interface ExecuteToolsOptions {
    toolCalls: ToolCall[];
    tools: Tool[];
    agentContext: AgentContext<unknown>;
    logger: Logger;
    toolTimeoutMs?: number | undefined;
    maxIdempotentRetries?: number | undefined;
    retryBaseDelayMs?: number | undefined;
    retryJitterMs?: number | undefined;
}

export type ToolResult = { toolCallId: string; result: string };

/**
 * Shared helper to execute a list of LLM tool calls.
 * Applies timeout and retry logic per tool execution.
 */
export async function executeTools(options: ExecuteToolsOptions): Promise<ToolResult[]> {
    const {
        toolCalls,
        tools,
        agentContext,
        logger,
        toolTimeoutMs,
        maxIdempotentRetries,
        retryBaseDelayMs,
        retryJitterMs
    } = options;

    const toolResults: ToolResult[] = [];

    for (const toolCall of toolCalls) {
        const result = await withTimeout({
            timeoutMs: toolTimeoutMs ?? 10_000,
            label: `Tool '${toolCall.name}'`,
            run: () => retryIdempotent({
                maxRetries: maxIdempotentRetries ?? 2,
                baseDelayMs: retryBaseDelayMs ?? 75,
                jitterMs: retryJitterMs ?? 25,
                run: () => dispatchToolCall({ toolCall, tools, context: agentContext })
            })
        });

        logger.debug({
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: result.status
        }, 'Tool execution completed');

        toolResults.push({
            toolCallId: toolCall.id,
            result: result.status === 'ok' ? result.result : result.formatted
        });
    }

    return toolResults;
}
