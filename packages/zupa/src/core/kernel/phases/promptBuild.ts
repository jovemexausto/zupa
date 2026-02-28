import { z } from 'zod';
import nunjucks from 'nunjucks';

import { applyLengthPreference } from '../../domain/preferences';
import { definePhase } from '../phase';
import {
  AssembledContextStateSchema,
  ContentStateSchema,
  PromptInputStateSchema
} from './stateSchemas';

/**
 * prompt_build
 *
 * Purpose:
 * - Build model-ready prompt input payload from assembled context/content.
 *
 * Contract:
 * - requires: `state.assembledContext`, `state.content`
 * - provides: `state.promptInput`
 *
 * Placeholder behavior:
 * - Uses static `config.prompt` as system prompt.
 * - Emits single user message from resolved content.
 */
export const promptBuildPhase = definePhase({
  name: 'prompt_build',
  requires: z.object({
    assembledContext: AssembledContextStateSchema,
    content: ContentStateSchema
  }),
  provides: z.object({ promptInput: PromptInputStateSchema }),
  async run(context) {
    if (context.state.commandHandled === true) {
      context.state.promptInput = {
        systemPrompt: '',
        messages: []
      };
      return;
    }

    const content = context.state.content as { contentText: string };
    const assembledContext = context.state.assembledContext as Record<string, unknown>;
    const user = context.state.user as { preferences?: Record<string, unknown> } | undefined;

    let basePrompt: string;
    if (typeof context.config.prompt === 'function') {
      const dynamicPrompt = await context.config.prompt({
        user: context.state.user as never,
        session: context.state.session as never,
        inbound: context.inbound,
        language: context.config.language,
        replyTarget: context.state.replyTarget as string,
        resources: context.resources,
        endSession: async () => {
          return;
        }
      });
      basePrompt = String(dynamicPrompt ?? '');
    } else {
      basePrompt = context.config.prompt;
    }

    let systemPrompt = nunjucks.renderString(basePrompt, {
      ...assembledContext,
      inboundText: content.contentText
    });
    systemPrompt = applyLengthPreference(systemPrompt, user?.preferences?.max_reply_length);

    const history =
      (assembledContext.workingMemory as Array<{ role: 'user' | 'assistant' | 'tool'; content: string }> | undefined)
      ?? [];
    const messages = [...history, { role: 'user' as const, content: content.contentText }];

    context.state.promptInput = {
      systemPrompt,
      messages
    };
  }
});
