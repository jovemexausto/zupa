import type { z } from 'zod';

import type { Tool, ToolContext, ToolLifecycleResult } from './contracts';
import { withTimeout } from '../../core/utils';

interface ExecuteToolLifecycleInput<TParameters extends z.ZodTypeAny> {
  tool: Tool<TParameters>;
  params: z.infer<TParameters>;
  context: ToolContext;
  timeoutMs?: number;
}

function formatToolFailure(toolName: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Tool ${toolName} failed: ${reason}`;
}

export async function executeToolLifecycle<TParameters extends z.ZodTypeAny>(
  input: ExecuteToolLifecycleInput<TParameters>
): Promise<ToolLifecycleResult> {
  let effectiveParams = input.params;

  try {
    const runLifecycle = async (): Promise<ToolLifecycleResult> => {
      if (input.tool.before) {
        const modified = await input.tool.before(effectiveParams, input.context);
        if (modified !== undefined) {
          effectiveParams = modified;
        }
      }

      const handlerResult = await input.tool.handler(effectiveParams, input.context);
      let finalResult = handlerResult;

      if (input.tool.after) {
        const modified = await input.tool.after(effectiveParams, handlerResult, input.context);
        if (modified !== undefined) {
          finalResult = modified;
        }
      }

      return {
        status: 'ok',
        result: finalResult
      };
    };

    if (input.timeoutMs !== undefined) {
      return await withTimeout({
        timeoutMs: input.timeoutMs,
        label: `Tool ${input.tool.name}`,
        run: runLifecycle
      });
    }

    return await runLifecycle();
  } catch (error) {
    return {
      status: 'recoverable_error',
      formatted: formatToolFailure(input.tool.name, error)
    };
  }
}
