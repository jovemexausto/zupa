import type { z } from 'zod';
import { AgentContext } from '../../core/domain';

export type ToolContext = AgentContext;

export interface Tool<TParameters extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: TParameters;
  before?: (params: z.infer<TParameters>, context: ToolContext) => Promise<z.infer<TParameters> | void>;
  handler: (params: z.infer<TParameters>, context: ToolContext) => Promise<string>;
  after?: (
    params: z.infer<TParameters>,
    result: string,
    context: ToolContext
  ) => Promise<string | void>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolLifecycleResult =
  | { status: 'ok'; result: string }
  | { status: 'recoverable_error'; formatted: string };
