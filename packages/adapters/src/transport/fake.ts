import {
    type MessagingTransportPort,
    type InboundMessage
} from '@zupa/core';

export class FakeMessagingTransport implements MessagingTransportPort {
    public sentMessages: Array<{ to: string; text?: string; audioPath?: string; mediaPath?: string }> = [];
    private handlers = new Set<(message: InboundMessage) => Promise<void>>();

    public sentText: Array<{ to: string; text: string }> = [];
    public sentVoice: Array<{ to: string; audioPath: string }> = [];
    public sentMedia: Array<{ to: string; mediaPath: string }> = [];
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

    public onAuthQr?(handler: (qr: string) => void): () => void {
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

    public async sendVoice(to: string, audioPath: string): Promise<void> {
        this.sentMessages.push({ to, audioPath });
        this.sentVoice.push({ to, audioPath });
    }

    public async sendMedia(to: string, mediaPath: string, _caption?: string): Promise<void> {
        this.sentMessages.push({ to, mediaPath });
        this.sentMedia.push({ to, mediaPath });
    }

    public async sendTyping(_to: string, _durationMs: number): Promise<void> {
        // No-op
    }

    public async simulateInbound(message: InboundMessage): Promise<void> {
        const promises = [];
        for (const handler of this.handlers) {
            promises.push(handler(message));
        }
        await Promise.all(promises);
    }

    public async emitInbound(message: InboundMessage): Promise<void> {
        await this.simulateInbound(message);
    }

    public getSentMessages() {
        return this.sentMessages;
    }

    public get inboundHandlerCount(): number {
        return this.handlers.size;
    }
}
