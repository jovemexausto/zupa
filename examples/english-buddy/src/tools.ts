import { z } from 'zod';

import type { Tool } from 'zupa';

const ScheduleReminderSchema = z.object({
  minutes: z.number().int().positive(),
  text: z.string().min(1)
});

const VocabCardSchema = z.object({
  word: z.string().min(1),
  definition: z.string().min(1)
});

const PronunciationClipSchema = z.object({
  word: z.string().min(1)
});

export const scheduleReminder = {
  name: 'schedule_reminder',
  description: 'Schedules a reminder message for the user.',
  parameters: ScheduleReminderSchema,
  async handler(params, context) {
    const typedParams = params as z.infer<typeof ScheduleReminderSchema>;
    const sendAt = new Date(Date.now() + typedParams.minutes * 60_000);
    await context.resources.transport.sendText(context.replyTarget, `Reminder set for ${sendAt.toISOString()}: ${typedParams.text}`);
    return `Reminder scheduled for ${sendAt.toISOString()}`;
  }
} satisfies Tool;

export const sendVocabCard = {
  name: 'send_vocab_card',
  description: 'Sends a vocabulary card message.',
  parameters: VocabCardSchema,
  async handler(params, context) {
    const typedParams = params as z.infer<typeof VocabCardSchema>;
    await context.resources.transport.sendText(
      context.replyTarget,
      `Word: ${typedParams.word}\nDefinition: ${typedParams.definition}`
    );
    return `Vocab card sent for ${typedParams.word}`;
  }
} satisfies Tool;

export const sendPronunciationClip = {
  name: 'send_pronunciation_clip',
  description: 'Sends pronunciation guidance text.',
  parameters: PronunciationClipSchema,
  async handler(params, context) {
    const typedParams = params as z.infer<typeof PronunciationClipSchema>;
    await context.resources.transport.sendText(
      context.replyTarget,
      `Pronunciation tip for ${typedParams.word}: break it into syllables and stress the right part.`
    );
    return `Pronunciation guidance sent for ${typedParams.word}`;
  }
} satisfies Tool;
