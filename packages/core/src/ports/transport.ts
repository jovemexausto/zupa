import { RuntimeResource } from "../lifecycle";

// TODO: maybe we should introduce OutboundMedia and/or OutboundMessage ?
export interface InboundMedia {
  data: string;
  mimetype: string;
  filename: string | null;
}

export interface InboundMessage {
  /**
   * Stable, unique identifier for this inbound message.
   * Used as the idempotency key for deduplication: the runtime graph will
   * reject any message whose messageId has already been processed.
   *
   * Transport adapters that have a natural message ID (e.g., WhatsApp's
   * `message.id._serialized`) MUST populate this field.
   * Adapters without a natural ID (e.g., custom webhooks) MUST generate a
   * deterministic fingerprint (see `generateMessageId` in @zupa/core/utils).
   */
  messageId: string;
  from: string;
  body: string;
  fromMe: boolean;
  hasMedia?: boolean;
  type?: string;
  audioPath?: string;
  downloadMedia?: () => Promise<InboundMedia | undefined>;
}

export interface MessagingTransport extends RuntimeResource {
  onInbound?(handler: (message: InboundMessage) => Promise<void>): () => void;
  onAuthQr?(handler: (qr: string) => void): () => void;
  onAuthReady?(handler: () => void): () => void;
  onAuthFailure?(handler: (message: string) => void): () => void;
  sendText(to: string, text: string): Promise<void>;
  sendVoice(to: string, audioPath: string): Promise<void>;
  sendMedia(to: string, mediaPath: string, caption?: string): Promise<void>;
  sendTyping(to: string, durationMs: number): Promise<void>;
}
