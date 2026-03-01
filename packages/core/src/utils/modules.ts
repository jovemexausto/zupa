import { z } from 'zod';
import {
    Tool,
    ToolCall,
    ToolLifecycleResult,
    AgentContext,
    CommandDefinition
} from '../contracts/modules';
import { LLMProvider } from '../ports/llm';
import { withTimeout } from './async';

/**
 * Executes a tool with its lifecycle hooks (before/after).
 */
interface ExecuteToolLifecycleInput<TParameters extends z.ZodTypeAny> {
    tool: Tool<TParameters>;
    params: z.infer<TParameters>;
    context: AgentContext;
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

/**
 * Dispatches a tool call by finding the tool in the provided list and executing it.
 */
interface DispatchToolCallInput {
    toolCall: ToolCall;
    tools: Tool[];
    context: AgentContext;
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

    const runInput: ExecuteToolLifecycleInput<z.ZodTypeAny> = {
        tool: tool as Tool<z.ZodTypeAny>,
        params: parsed.data,
        context: input.context
    };
    if (input.timeoutMs !== undefined) {
        runInput.timeoutMs = input.timeoutMs;
    }

    return executeToolLifecycle(runInput);
}

/**
 * Builtin commands available to all agents.
 */
export const builtinCommands = {
    reset: {
        description: 'Clear session and start fresh',
        handler: async (ctx: AgentContext) => {
            await ctx.endSession();
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Session cleared. Starting fresh!');
        }
    },
    usage: {
        description: 'Show usage status.',
        handler: async (ctx: AgentContext) => {
            await ctx.resources.transport.sendText(
                ctx.replyTarget,
                'Usage stats are not available yet in Zupa.'
            );
        }
    },
    text: {
        description: 'Force text replies (ignore voice)',
        handler: async (ctx: AgentContext) => {
            await ctx.resources.database.updateUserPreferences(ctx.user.id, {
                ...ctx.user.preferences,
                preferredReplyFormat: 'text'
            });
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Preference updated: I will now only reply with text.');
        }
    },
    voice: {
        description: 'Force voice replies (TTS)',
        handler: async (ctx: AgentContext) => {
            await ctx.resources.database.updateUserPreferences(ctx.user.id, {
                ...ctx.user.preferences,
                preferredReplyFormat: 'voice'
            });
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Preference updated: I will now reply with voice (audio).');
        }
    },
    mirror: {
        description: 'Mirror your input modality (default)',
        handler: async (ctx: AgentContext) => {
            await ctx.resources.database.updateUserPreferences(ctx.user.id, {
                ...ctx.user.preferences,
                preferredReplyFormat: 'mirror'
            });
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Preference updated: I will now mirror your input modality.');
        }
    },
    dynamic: {
        description: 'Intelligently decide modality per-turn',
        handler: async (ctx: AgentContext) => {
            await ctx.resources.database.updateUserPreferences(ctx.user.id, {
                ...ctx.user.preferences,
                preferredReplyFormat: 'dynamic'
            });
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Preference updated: I will now intelligently choose between text and voice.');
        }
    }
};

/**
 * Builds a command registry by merging builtins with consumer-provided commands.
 */
export function buildCommandRegistry(
    consumer: Record<string, false | CommandDefinition<z.ZodType>> = {}
): Map<string, CommandDefinition<z.ZodType>> {
    const registry = new Map<string, CommandDefinition<z.ZodType>>();

    registry.set('reset', builtinCommands.reset as CommandDefinition<z.ZodType>);
    registry.set('usage', builtinCommands.usage as CommandDefinition<z.ZodType>);
    registry.set('text', builtinCommands.text as CommandDefinition<z.ZodType>);
    registry.set('voice', builtinCommands.voice as CommandDefinition<z.ZodType>);
    registry.set('mirror', builtinCommands.mirror as CommandDefinition<z.ZodType>);
    registry.set('dynamic', builtinCommands.dynamic as CommandDefinition<z.ZodType>);

    for (const [name, definition] of Object.entries(consumer)) {
        if (definition === false) {
            registry.delete(name);
            continue;
        }
        registry.set(name, definition);
    }

    return registry;
}

/**
 * Dispatches a command if the input text starts with a slash.
 */
interface DispatchCommandInput {
    rawText: string;
    commandRegistry: Map<string, CommandDefinition<z.ZodType>>;
    commandContext: AgentContext;
    llm: LLMProvider;
}

function parseCommand(rawText: string): { name: string; rawArgs: string } {
    const trimmed = rawText.trim();
    const body = trimmed.slice(1).trim();
    const firstSpace = body.indexOf(' ');

    if (firstSpace === -1) {
        return { name: body.toLowerCase(), rawArgs: '' };
    }

    return {
        name: body.slice(0, firstSpace).toLowerCase(),
        rawArgs: body.slice(firstSpace + 1).trim()
    };
}

export async function dispatchCommandIfPresent(input: DispatchCommandInput): Promise<boolean> {
    if (!input.rawText.trim().startsWith('/')) {
        return false;
    }

    const parsed = parseCommand(input.rawText);
    if (!parsed.name) {
        return false;
    }

    if (parsed.name === 'help') {
        const lines = ['Available commands:', '', `/help  — Show this message`];
        for (const [name, definition] of input.commandRegistry.entries()) {
            lines.push(`/${name}  — ${definition.description}`);
        }
        await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, lines.join('\n'));
        return true;
    }

    const command = input.commandRegistry.get(parsed.name);
    if (!command) {
        await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, 'Unknown command. Try /help');
        return true;
    }

    if (!command.args) {
        await (command.handler as (ctx: AgentContext) => Promise<void>)(input.commandContext);
    } else {
        await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, `Command ${parsed.name} requires arguments.`);
    }

    return true;
}
