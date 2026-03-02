import {
    type MessagingTransport,
    type InboundMessage,
    type EventBus,
    type RuntimeResourceContext,
    ensureMessageId
} from '@zupa/core';

export class FakeMessagingTransport implements MessagingTransport {
    public sentMessages: Array<{ to: string; text?: string; audio?: Buffer; media?: Buffer }> = [];
    private bus: EventBus | null = null;
    public sentText: Array<{ to: string; text: string }> = [];
    public sentVoice: Array<{ to: string; media: { buffer: Buffer; mimetype: string } }> = [];
    public sentMedia: Array<{ to: string; media: { buffer: Buffer; mimetype: string; filename?: string } }> = [];

    public async start(context: RuntimeResourceContext): Promise<void> {
        this.bus = context.bus;
    }
    public async close(): Promise<void> { }

    public async sendText(to: string, text: string): Promise<void> {
        this.sentMessages.push({ to, text });
        this.sentText.push({ to, text });
    }

    public async sendVoice(to: string, media: { buffer: Buffer; mimetype: string }): Promise<void> {
        this.sentMessages.push({ to, audio: media.buffer });
        this.sentVoice.push({ to, media });
    }

    public async sendMedia(to: string, media: { buffer: Buffer; mimetype: string; filename?: string }, _caption?: string): Promise<void> {
        this.sentMessages.push({ to, media: media.buffer });
        this.sentMedia.push({ to, media });
    }

    public async sendTyping(_to: string, _durationMs: number): Promise<void> {
        // No-op
    }

    public async simulateInbound(message: Omit<InboundMessage, 'messageId' | 'source'> & { messageId?: string, source?: 'transport' | 'ui_channel' }): Promise<void> {
        const full = ensureMessageId({ source: 'transport', ...message } as InboundMessage);
        if (this.bus) {
            this.bus.emit({
                channel: 'transport',
                name: 'inbound',
                payload: full,
            });
        }
    }

    public simulateAuthRequest(payload: any): void {
        if (this.bus) {
            this.bus.emit({
                channel: 'transport',
                name: 'auth:request',
                payload,
            });
        }
    }

    public simulateAuthReady(): void {
        if (this.bus) {
            this.bus.emit({
                channel: 'transport',
                name: 'auth:ready',
                payload: undefined,
            });
        }
    }

    public async emitInbound(message: Omit<InboundMessage, 'messageId' | 'source'> & { messageId?: string, source?: 'transport' | 'ui_channel' }): Promise<void> {
        await this.simulateInbound({ source: 'transport', ...message });
    }

    public getSentMessages() {
        return this.sentMessages;
    }
}
