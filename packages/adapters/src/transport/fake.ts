import {
  type MessagingTransport,
  type EventBus,
  type RuntimeResourceContext,
  type InboundMessage,
  type OutboundMessage,
  ensureMessageId,
} from "@zupa/core";

export class FakeMessagingTransport implements MessagingTransport {
  public sentMessages: Array<{
    to: string;
    text?: string;
    audio?: Buffer;
    media?: Buffer;
    caption?: string;
  }> = [];
  private bus: EventBus | null = null;
  public sentText: Array<{ to: string; text: string }> = [];
  public sentVoice: Array<{ to: string; media: { buffer: Buffer; mimetype: string } }> = [];
  public sentMedia: Array<{
    to: string;
    media: { buffer: Buffer; mimetype: string; filename?: string | null };
  }> = [];

  public async start(context: RuntimeResourceContext): Promise<void> {
    this.bus = context.bus;
  }
  public async close(): Promise<void> { }

  public async sendMessage(message: OutboundMessage): Promise<void> {
    this.bus?.emit({
      channel: "transport",
      name: "outbound",
      payload: message,
    });

    switch (message.type) {
      case "text":
        this.sentMessages.push({ to: message.to, text: message.body });
        this.sentText.push({ to: message.to, text: message.body });
        break;
      case "voice":
        this.sentMessages.push({ to: message.to, audio: message.media.data });
        this.sentVoice.push({
          to: message.to,
          media: { buffer: message.media.data, mimetype: message.media.mimetype },
        });
        break;
      case "media":
        this.sentMessages.push({
          to: message.to,
          media: message.media.data,
          ...(message.caption !== undefined && { caption: message.caption }),
        });
        this.sentMedia.push({
          to: message.to,
          media: {
            buffer: message.media.data,
            mimetype: message.media.mimetype,
            ...(message.media.filename !== undefined && { filename: message.media.filename }),
          },
        });
        break;
    }
  }

  public async sendTyping(_to: string, _durationMs: number): Promise<void> {
    // No-op
  }

  public async simulateInbound(
    message: Omit<InboundMessage, "messageId" | "source"> & {
      messageId?: string;
      source?: "transport" | "ui_channel";
    },
  ): Promise<void> {
    const full = ensureMessageId({ source: "transport", ...message } as InboundMessage);
    if (this.bus) {
      this.bus.emit({
        channel: "transport",
        name: "inbound",
        payload: full,
      });
    }
  }

  public simulateAuthRequest(payload: any): void {
    if (this.bus) {
      this.bus.emit({
        channel: "transport",
        name: "auth:request",
        payload,
      });
    }
  }

  public simulateAuthReady(): void {
    if (this.bus) {
      this.bus.emit({
        channel: "transport",
        name: "auth:ready",
        payload: undefined,
      });
    }
  }

  public async emitInbound(
    message: Omit<InboundMessage, "messageId" | "source"> & {
      messageId?: string;
      source?: "transport" | "ui_channel";
    },
  ): Promise<void> {
    await this.simulateInbound({ source: "transport", ...message });
  }

  public getSentMessages() {
    return this.sentMessages;
  }
}
