import { z } from 'zod';

export const AccessStateSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional()
});

export const UserRefStateSchema = z.object({
  id: z.string()
});

export const UserStateSchema = z.object({
  id: z.string(),
  externalUserId: z.string(),
  displayName: z.string(),
  preferences: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  lastActiveAt: z.date()
});

export const SessionRefStateSchema = z.object({
  id: z.string(),
  userId: z.string()
});

export const SessionStateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  summary: z.string().nullable(),
  messageCount: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  kv: z.object({
    get: z.function(),
    set: z.function(),
    delete: z.function(),
    all: z.function()
  })
});

export const ReplyTargetStateSchema = z.string().min(1);
export const CreatedUserStateSchema = z.boolean();
export const InboundDuplicateStateSchema = z.boolean();
export const CommandHandledStateSchema = z.boolean();
export const PreferredVoiceReplyStateSchema = z.boolean();

export const ContentStateSchema = z.object({
  contentText: z.string(),
  inputModality: z.enum(['text', 'voice'])
});

export const AssembledContextStateSchema = z.record(z.string(), z.unknown());

export const PromptMessageStateSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional()
});

export const PromptInputStateSchema = z.object({
  systemPrompt: z.string(),
  messages: z.array(PromptMessageStateSchema)
});

export const ReplyDraftStateSchema = z.object({
  text: z.string(),
  structured: z.unknown().optional(),
  toolResults: z.array(z.string()).optional(),
  tokensUsed: z.object({
    promptTokens: z.number(),
    completionTokens: z.number()
  }).optional(),
  model: z.string().optional(),
  latencyMs: z.number().optional()
});

export const FinalStateSchema = z.object({
  outputModality: z.enum(['text', 'voice']),
  contentAudioUrl: z.string().nullable(),
  replyText: z.string().optional()
});

export const PersistenceStateSchema = z.object({
  saved: z.boolean(),
  userMessageId: z.string().optional(),
  assistantMessageId: z.string().optional()
});

export const TelemetrySummaryStateSchema = z.object({
  emitted: z.boolean(),
  error: z.string().optional()
});
