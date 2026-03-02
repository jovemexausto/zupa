import { z, type ZodRawShape } from "zod";

// TODO (deferred): consider using tools for both modality preference and session end signals instead of overloading the LLM response with these fields.
// This would allow for clearer separation of concerns and more explicit handling of these important signals.
// For example, a "set_modality_preference" tool call could explicitly set the user's preferred modality in state
// and an "end_session" tool call could signal a clear intent to end the conversation
// rather than relying on the LLM to populate these fields correctly in its response.
// This is better because as outputSchema is optional (and even must conflic with the reactive-ui chat features, which usally expects raw text for streaming),
export const ModalitySchema = z
  .enum(["text", "voice"])
  .nullable()
  .describe(
    "Return 'voice' if user requests audio/spoken response, 'text' if text is requested, null if no clear preference.",
  );

export const SessionEndedSchema = z
  .boolean()
  .describe(
    "True only if the user has given a clear signal of ending the conversation",
  );

export const ReplySchema = z.object({
  reply: z.string().describe("The content to say to the user"),
  modality: ModalitySchema,
  sessionEnded: SessionEndedSchema,
});

/**
 * Wraps a custom Zod shape with the required WithReply fields (reply + modality).
 */
export function withReply<T extends ZodRawShape>(customShape: T) {
  return z.object(customShape).extend(ReplySchema.shape);
}

/**
 * TODO (deferred): isn't the .describe() already doing this job? Check it out.
 * Injects modality instructions into the system prompt for dynamic users.
 */
export function applyModalityPreference(
  prompt: string,
  preferences: any,
): string {
  if (preferences?.preferredReplyFormat === "dynamic") {
    return `${prompt}\n\nThe user's output preference is dynamic. Determine if they explicitly asked for text or voice and adjust your output modality accordingly by populating the 'modality' field. If they didn't specify, return null.`;
  }
  return prompt;
}
