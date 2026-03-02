import { z } from "zod";
import {
  createAgent,
  withReply,
  WWebJSAuthPayload,
  WWebJSMessagingTransport,
} from "zupa";

import {
  scheduleReminder,
  sendPronunciationClip,
  sendVocabCard,
} from "./tools";
import { getRecurringMistakes, getVocabularyHistory } from "./queries";
//
import { config } from "dotenv";
import { generateAsciiQR } from "./qr";
config();
//

const CorrectionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
  category: z.enum([
    "grammar",
    "vocabulary",
    "preposition",
    "article",
    "other",
  ]),
});

const AgentReplySchema = withReply({
  correction: CorrectionSchema.nullable(),
  vocabularyIntroduced: z.array(z.string()),
});

const agent = createAgent({
  prompt: `
    You are Sam, a friendly assistant in your late 20s chatting with
    {{ user.displayName }} on WhatsApp.

    {% if recurringMistakes.length %}
    Mistakes to watch for: {{ recurringMistakes | join(', ') }}
    {% endif %}

    {% if vocabularyHistory.length %}
    Words already introduced: {{ vocabularyHistory | join(', ') }}
    {% endif %}

    Keep replies to 2-4 sentences.
  `,
  outputSchema: AgentReplySchema,
  tools: [scheduleReminder, sendVocabCard, sendPronunciationClip],
  //
  language: "pt",
  modality: "text",
  //
  context: async (ctx) => ({
    recurringMistakes: await getRecurringMistakes(ctx.user.id),
    vocabularyHistory: await getVocabularyHistory(ctx.user.id),
  }),
  //
  onResponse: async (response, ctx) => {
    await ctx.resources.domainStore.updateMessageMetadata(ctx.session.id, {
      correction: response.correction,
      vocabularyIntroduced: response.vocabularyIntroduced,
    });
  },
  providers: {
    transport: new WWebJSMessagingTransport(),
  },
});

agent.on<WWebJSAuthPayload>("auth:request", (payload) =>
  generateAsciiQR(payload.qrString).then(console.log),
);
agent.on("auth:ready", () => console.log("Sam is online"));

void agent.start().catch(console.error);
