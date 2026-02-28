import { RuntimeResource } from "../lifecycle";

// TODO: maybe we should introduce OutboundMedia and/or OutboundMessage ?
export interface InboundMedia {
  data: string;
  mimetype: string;
  filename: string | null;
}

export interface InboundMessage {
  id?: string;
  from: string;
  body: string;
  fromMe: boolean;
  hasMedia?: boolean;
  type?: string;
  audioPath?: string;
  downloadMedia?: () => Promise<InboundMedia | undefined>;
}

export interface MessagingTransportPort extends RuntimeResource {
  onInbound?(handler: (message: InboundMessage) => Promise<void>): () => void;
  onAuthQr?(handler: (qr: string) => void): () => void;
  onAuthReady?(handler: () => void): () => void;
  onAuthFailure?(handler: (message: string) => void): () => void;
  sendText(to: string, text: string): Promise<void>;
  sendVoice(to: string, audioPath: string): Promise<void>;
  sendMedia(to: string, mediaPath: string, caption?: string): Promise<void>;
  sendTyping(to: string, durationMs: number): Promise<void>;
}
