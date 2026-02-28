import type { z } from 'zod';

import { builtins } from './builtins';
import type { CommandDefinition } from './contracts';

export type CommandRegistry = Map<string, CommandDefinition<z.ZodType>>;

export function buildCommandRegistry(
  consumer: Record<string, false | CommandDefinition<z.ZodType>> = {}
): CommandRegistry {
  const registry: CommandRegistry = new Map();

  registry.set('reset', builtins.reset as CommandDefinition<z.ZodType>);
  registry.set('usage', builtins.usage as CommandDefinition<z.ZodType>);

  for (const [name, definition] of Object.entries(consumer)) {
    if (definition === false) {
      registry.delete(name);
      continue;
    }

    registry.set(name, definition);
  }

  return registry;
}
