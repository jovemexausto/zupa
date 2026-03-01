import {
    type MessagingTransport,
    type InboundMessage,
    ensureMessageId
} from '@zupa/core';

export class FakeMessagingTransport implements MessagingTransport {
    public sentMessages: Array<{ to: string; text?: string; audio?: Buffer; media?: Buffer }> = [];
    private handlers = new Set<(message: InboundMessage) => Promise<void>>();

    public sentText: Array<{ to: string; text: string }> = [];
    public sentVoice: Array<{ to: string; media: { buffer: Buffer; mimetype: string } }> = [];
    public sentMedia: Array<{ to: string; media: { buffer: Buffer; mimetype: string; filename?: string } }> = [];
    public inboundSubscriptions = 0;
    public inboundUnsubscriptions = 0;

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }

    public onInbound(handler: (message: InboundMessage) => Promise<void>): () => void {
        this.handlers.add(handler);
        this.inboundSubscriptions++;
        return () => {
            this.handlers.delete(handler);
            this.inboundUnsubscriptions++;
        };
    }

    public onAuthRequest?(handler: (payload: unknown) => void): () => void {
        return () => { };
    }

    public onAuthReady?(handler: () => void): () => void {
        return () => { };
    }

    public onAuthFailure?(handler: (message: string) => void): () => void {
        return () => { };
    }

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

    public async simulateInbound(message: Omit<InboundMessage, 'messageId'> & { messageId?: string }): Promise<void> {
        const full = ensureMessageId(message);
        const promises = [];
        for (const handler of this.handlers) {
            promises.push(handler(full));
        }
        await Promise.all(promises);
    }

    public async emitInbound(message: Omit<InboundMessage, 'messageId'> & { messageId?: string }): Promise<void> {
        await this.simulateInbound(message);
    }

    public getSentMessages() {
        return this.sentMessages;
    }

    public get inboundHandlerCount(): number {
        return this.handlers.size;
    }
}
