import type { Tool, ToolCall, ToolContext, ToolLifecycleResult } from './contracts';
import { executeToolLifecycle } from './hooks';

interface DispatchToolCallInput {
  toolCall: ToolCall;
  tools: Tool[];
  context: ToolContext;
  timeoutMs?: number;
}

export async function dispatchToolCall(input: DispatchToolCallInput): Promise<ToolLifecycleResult> {
  const tool = input.tools.find((candidate) => candidate.name === input.toolCall.name);
  if (!tool) {
    return {
      status: 'recoverable_error',
      formatted: `Tool ${input.toolCall.name} failed: tool not found`
    };
  }

  const parsed = tool.parameters.safeParse(input.toolCall.arguments);
  if (!parsed.success) {
    return {
      status: 'recoverable_error',
      formatted: `Invalid tool params for ${input.toolCall.name}: ${parsed.error.message}`
    };
  }

  const runInput: Parameters<typeof executeToolLifecycle>[0] = {
    tool,
    params: parsed.data,
    context: input.context
  };
  if (input.timeoutMs !== undefined) {
    runInput.timeoutMs = input.timeoutMs;
  }

  return executeToolLifecycle(runInput);
}
