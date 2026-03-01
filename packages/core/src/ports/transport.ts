import { RuntimeResource } from "../lifecycle";

// TODO: maybe we should introduce OutboundMedia and/or OutboundMessage ?
export interface InboundMedia {
  data: Buffer;
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
  hasMedia?: boolean;
  type?: string;

  /** Discriminates between external messaging platforms and the internal Reactive UI WebSocket */
  source: 'transport' | 'ui_channel';

  /** If source is 'ui_channel', identifies the specific connected WebSocket client */
  clientId?: string;

  downloadMedia?: () => Promise<InboundMedia | undefined>;
}

export interface MessagingTransport<TAuthPayload = unknown> extends RuntimeResource {
  onInbound?(handler: (message: InboundMessage) => Promise<void>): () => void;

  /**
   * Called when the transport requires user action to authenticate.
   * The payload shape is defined entirely by the concrete transport adapter.
   * For example, WWebJSTransport emits `{ type: 'qr', qrString: string }`.
   */
  onAuthRequest?(handler: (payload: TAuthPayload) => void): () => void;

  onAuthReady?(handler: () => void): () => void;
  onAuthFailure?(handler: (message: string) => void): () => void;
  sendText(to: string, text: string): Promise<void>;
  sendVoice(
    to: string,
    media: { buffer: Buffer; mimetype: string },
  ): Promise<void>;
  sendMedia(
    to: string,
    media: { buffer: Buffer; mimetype: string; filename?: string },
    caption?: string,
  ): Promise<void>;
  sendTyping(to: string, durationMs: number): Promise<void>;

  /**
   * Phantom field — never populated at runtime.
   * Exists solely so TypeScript can carry TAuthPayload through assignment
   * (e.g. `const t: MessagingTransport<MyPayload>` infers back correctly).
   */
  readonly _authPayload?: TAuthPayload;
}
