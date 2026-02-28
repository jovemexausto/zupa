import type { z } from 'zod';

import { HELP_DESCRIPTION } from './builtins';
import type { CommandDefinition } from './contracts';
import type { CommandRegistry } from './registry';
import { parseCommandArgs } from './parseArgs';
import { AgentContext } from '../../core/domain';
import { LLMProviderPort } from '../../core/ports/llm';

interface DispatchCommandInput {
  rawText         : string;
  commandRegistry : CommandRegistry;
  commandContext  : AgentContext;
  llm             : LLMProviderPort;
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

function describeSchema(schema: z.ZodType): string {
  const shape = (schema as z.ZodObject).shape;
  if (!shape || typeof shape !== 'object') {
    return 'Please check /help for command usage.';
  }

  const fields = Object.entries(shape as Record<string, z.ZodType>).map(([key, field]) => {
    const hint = field.description ? ` (${field.description})` : '';
    return `- ${key}${hint}`;
  });

  if (fields.length === 0) {
    return 'Please check /help for command usage.';
  }

  return ['Expected arguments:', ...fields].join('\n');
}

function buildHelpText(registry: CommandRegistry): string {
  const lines = ['Available commands:', '', `/help  — ${HELP_DESCRIPTION}`];
  for (const [name, definition] of registry.entries()) {
    lines.push(`/${name}  — ${definition.description}`);
  }

  return lines.join('\n');
}

async function runCommandDefinition(command: CommandDefinition<z.ZodType>, rawArgs: string, input: DispatchCommandInput): Promise<void> {
  if (!command.args) {
    const noArgsHandler = command.handler as (ctx: AgentContext) => Promise<void>;
    await noArgsHandler(input.commandContext);
    return;
  }

  try {
    const parsedArgs = await parseCommandArgs(rawArgs, command.args, input.llm);
    const withArgsHandler = command.handler as (ctx: AgentContext, args: unknown) => Promise<void>;
    await withArgsHandler(input.commandContext, parsedArgs);
  } catch {
    await input.commandContext.resources.transport.sendText(
      input.commandContext.replyTarget,
      `I couldn't parse that command.\n${describeSchema(command.args)}`
    );
  }
}

export async function dispatchCommandIfPresent(input: DispatchCommandInput): Promise<boolean> {
  if (!input.rawText.trim().startsWith('/')) {
    return false;
  }

  const parsed = parseCommand(input.rawText);
  if (!parsed.name) {
    await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, 'Unknown command. Try /help');
    return true;
  }

  if (parsed.name === 'help') {
    await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, buildHelpText(input.commandRegistry));
    return true;
  }

  const command = input.commandRegistry.get(parsed.name);
  if (!command) {
    await input.commandContext.resources.transport.sendText(input.commandContext.replyTarget, 'Unknown command. Try /help');
    return true;
  }

  await runCommandDefinition(command, parsed.rawArgs, input);
  return true;
}
