import { z, type ZodRawShape } from 'zod';

export const ModalitySchema = z.enum(['text', 'voice']).optional().describe(
    "Analyze the conversation and the user's latest message. " +
    "If they ask for voice, audio, or a spoken response, return 'voice'. " +
    "If they ask for text, return 'text'. " +
    "If there is no clear signal or preference, leave this field undefined."
);

export const ReplySchema = z.object({
    reply: z.string().describe("The content to say to the user"),
    modality: ModalitySchema
});

/**
 * Wraps a custom Zod shape with the required WithReply fields (reply + modality).
 */
export function withReply<T extends ZodRawShape>(
    customShape: T
): z.ZodObject<T & {
    reply: z.ZodString;
    modality: z.ZodTypeAny;
}> {
    return z.object({
        ...customShape,
        ...ReplySchema
    }) as unknown as z.ZodObject<T & {
        reply: z.ZodString;
        modality: z.ZodTypeAny;
    }>;
}

/**
 * TODO: isn't the .describe() already doing this job? Check it out.
 * Injects modality instructions into the system prompt for dynamic users.
 */
export function applyModalityPreference(prompt: string, preferences: any): string {
    if (preferences?.preferredReplyFormat === 'dynamic') {
        return `${prompt}\n\nThe user's output preference is dynamic. Determine if they explicitly asked for text or voice and adjust your output modality accordingly by populating the 'modality' field. If they didn't specify, leave it undefined.`;
    }
    return prompt;
}
