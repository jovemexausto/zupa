import { z } from 'zod';
import { AgentContext } from './engine';
export { AgentContext };

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCallId?: string;
}

export type CommandRegistry = Map<string, CommandDefinition<z.ZodType>>;

export interface Tool<TParameters extends z.ZodTypeAny = z.ZodTypeAny> {
    name: string;
    description: string;
    parameters: TParameters;
    before?: (params: z.infer<TParameters>, context: AgentContext) => Promise<z.infer<TParameters> | void>;
    handler: (params: z.infer<TParameters>, context: AgentContext) => Promise<string>;
    after?: (
        params: z.infer<TParameters>,
        result: string,
        context: AgentContext
    ) => Promise<string | void>;
}

export type ToolLifecycleResult =
    | { status: 'ok'; result: string }
    | { status: 'recoverable_error'; formatted: string };

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface CommandDefinition<TArgs extends z.ZodType = z.ZodTypeAny> {
    description: string;
    args?: TArgs;
    handler: (ctx: AgentContext, args?: z.infer<TArgs>) => Promise<void>;
}
