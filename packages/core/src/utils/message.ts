import { createHash } from 'node:crypto';
import { type InboundMessage } from '../ports/transport';

/**
 * Generates a deterministic message ID from the inbound message's key fields.
 * Used by transport adapters that do not provide a natural platform message ID.
 *
 * The fingerprint is a SHA-256 hash of `from + body + timestamp (second precision)`,
 * which is stable under retries within the same second and unique across messages
 * from different users or with different content.
 *
 * Transport adapters with a real platform ID (e.g., WhatsApp `message.id._serialized`)
 * MUST use that instead of this function.
 */
export function generateMessageId(from: string, body: string, at: Date = new Date()): string {
    const secondPrecisionTs = Math.floor(at.getTime() / 1000);
    const raw = `${from}:${body}:${secondPrecisionTs}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Ensures an InboundMessage has a messageId, either by returning the
 * existing one or by generating a fallback fingerprint.
 * Useful in tests and for transports that construct InboundMessage without a platform ID.
 */
export function ensureMessageId(
    partial: Omit<InboundMessage, 'messageId'> & { messageId?: string },
    at?: Date
): InboundMessage {
    return {
        ...partial,
        messageId: partial.messageId ?? generateMessageId(partial.from, partial.body, at)
    };
}
