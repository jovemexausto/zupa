import { z } from 'zod';
import { createAgent, WWebJSAuthPayload, WWebJSMessagingTransport } from 'zupa';

import { scheduleReminder, sendPronunciationClip, sendVocabCard } from './tools';
import { getRecurringMistakes, getVocabularyHistory } from './queries';
//
import { config } from 'dotenv';
import { generateAsciiQR } from './qr';
config()
//

const CorrectionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
  category: z.enum(['grammar', 'vocabulary', 'preposition', 'article', 'other'])
});

const AgentReplySchema = z.object({
  reply: z.string(),
  correction: CorrectionSchema.nullable(),
  sessionEnded: z.boolean(),
  vocabularyIntroduced: z.array(z.string()),
});

type AgentReply = z.infer<typeof AgentReplySchema>;

const agent = createAgent<AgentReply>({
  prompt: `
    You are Sam, a friendly assistant in your late 20s chatting with
    {{ user.displayName }} on WhatsApp.

    {% if recurringMistakes.length %}
    Mistakes to watch for: {{ recurringMistakes | join(', ') }}
    {% endif %}

    {% if vocabularyHistory.length %}
    Words already introduced: {{ vocabularyHistory | join(', ') }}
    {% endif %}

    Keep replies to 2-4 sentences. Set sessionEnded only on clear goodbyes.
  `,
  outputSchema: AgentReplySchema,
  tools: [scheduleReminder, sendVocabCard, sendPronunciationClip],
  //
  language: 'pt',
  //
  context: async (ctx) => ({
    recurringMistakes: await getRecurringMistakes(ctx.user.id),
    vocabularyHistory: await getVocabularyHistory(ctx.user.id)
  }),
  //
  onResponse: async (response, ctx) => {
    await ctx.resources.database.updateMessageMetadata(ctx.session.id, {
      correction: response.correction,
      vocabularyIntroduced: response.vocabularyIntroduced
    });

    if (response.sessionEnded) {
      await ctx.endSession();
    }
  },
  providers: {
    transport: new WWebJSMessagingTransport()
  }
});

agent.on<WWebJSAuthPayload>('auth:request', (payload) => generateAsciiQR(payload.qrString).then(console.log));
agent.on('auth:ready', () => console.log('Sam is online'));

void agent.start().catch(console.error)