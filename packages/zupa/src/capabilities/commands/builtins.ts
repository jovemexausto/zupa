import type { CommandDefinition } from './contracts';

export interface BuiltinCommands {
  reset: CommandDefinition;
  usage: CommandDefinition;
}

export const builtins: BuiltinCommands = {
  reset: {
    description: 'Clear session and start fresh',
    handler: async (ctx) => {
      await ctx.endSession();
      await ctx.resources.transport.sendText(ctx.replyTarget, 'Session cleared. Starting fresh!');
    }
  },
  usage: {
    description: 'Show usage status.',
    handler: async (ctx) => {
      await ctx.resources.transport.sendText(
        ctx.replyTarget,
        'Usage stats are not available yet in Zupa.'
      );
    }
  }
};

export const HELP_DESCRIPTION = 'Show this message';
