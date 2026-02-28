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

export const scheduleReminder: Tool<typeof ScheduleReminderSchema> = {
  name: 'schedule_reminder',
  description: 'Schedules a reminder message for the user.',
  parameters: ScheduleReminderSchema,
  async handler(params, context) {
    const sendAt = new Date(Date.now() + params.minutes * 60_000);
    await context.resources.transport.sendText(context.replyTarget, `Reminder set for ${sendAt.toISOString()}: ${params.text}`);
    return `Reminder scheduled for ${sendAt.toISOString()}`;
  }
};

export const sendVocabCard: Tool<typeof VocabCardSchema> = {
  name: 'send_vocab_card',
  description: 'Sends a vocabulary card message.',
  parameters: VocabCardSchema,
  async handler(params, context) {
    await context.resources.transport.sendText(
      context.replyTarget,
      `Word: ${params.word}\nDefinition: ${params.definition}`
    );
    return `Vocab card sent for ${params.word}`;
  }
};

export const sendPronunciationClip: Tool<typeof PronunciationClipSchema> = {
  name: 'send_pronunciation_clip',
  description: 'Sends pronunciation guidance text.',
  parameters: PronunciationClipSchema,
  async handler(params, context) {
    await context.resources.transport.sendText(
      context.replyTarget,
      `Pronunciation tip for ${params.word}: break it into syllables and stress the right part.`
    );
    return `Pronunciation guidance sent for ${params.word}`;
  }
};
