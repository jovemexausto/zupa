import type { MessagingTransportPort } from '../../core/ports';
import type { InboundMessage } from '../../core/ports';

export class FakeMessagingTransport implements MessagingTransportPort {
  public readonly sentText: Array<{ to: string; text: string }> = [];
  public readonly sentVoice: Array<{ to: string; audioPath: string }> = [];
  public readonly sentMedia: Array<{ to: string; mediaPath: string; caption?: string }> = [];
  public readonly typingEvents: Array<{ to: string; durationMs: number }> = [];
  public inboundSubscriptions = 0;
  public inboundUnsubscriptions = 0;
  public inboundDeliveries = 0;
  private readonly inboundHandlers = new Set<(message: InboundMessage) => Promise<void>>();

  public get inboundHandlerCount(): number {
    return this.inboundHandlers.size;
  }

  public onInbound(handler: (message: InboundMessage) => Promise<void>): () => void {
    this.inboundSubscriptions += 1;
    this.inboundHandlers.add(handler);
    return () => {
      this.inboundUnsubscriptions += 1;
      this.inboundHandlers.delete(handler);
    };
  }

  public async emitInbound(message: InboundMessage): Promise<void> {
    for (const handler of this.inboundHandlers) {
      this.inboundDeliveries += 1;
      await handler(message);
    }
  }

  public async sendText(to: string, text: string): Promise<void> {
    this.sentText.push({ to, text });
  }

  public async sendVoice(to: string, audioPath: string): Promise<void> {
    this.sentVoice.push({ to, audioPath });
  }

  public async sendMedia(to: string, mediaPath: string, caption?: string): Promise<void> {
    if (caption === undefined) {
      this.sentMedia.push({ to, mediaPath });
      return;
    }

    this.sentMedia.push({ to, mediaPath, caption });
  }

  public async sendTyping(to: string, durationMs: number): Promise<void> {
    this.typingEvents.push({ to, durationMs });
  }
}
