import { type JsonValue } from '@zupa/core';

export type ZupaEvent =
    | { type: 'STATE_DELTA'; payload: Partial<Record<string, JsonValue>> }
    | { type: 'TOKEN_CHUNK'; payload: { id: string; content: string } }
    | { type: 'ERROR'; payload: { message: string } }
    | { type: 'CONNECTED' }
    | { type: 'DISCONNECTED' };

export class ZupaConnection {
    private ws: WebSocket | null = null;
    private handlers: Set<(event: ZupaEvent) => void> = new Set();
    private reconnectTimeout: any = null;
    private retryCount = 0;
    private isExplicitlyClosed = false;

    constructor(
        private readonly url: string,
        private readonly options: { clientId?: string; authToken?: string } = {}
    ) { }

    public connect() {
        if (this.ws) return;
        this.isExplicitlyClosed = false;

        const connectUrl = new URL(this.url);
        if (this.options.clientId) {
            connectUrl.searchParams.set('clientId', this.options.clientId);
        }
        if (this.options.authToken) {
            connectUrl.searchParams.set('authToken', this.options.authToken);
        }

        this.ws = new WebSocket(connectUrl.toString());

        this.ws.onopen = () => {
            this.retryCount = 0;
            this.emit({ type: 'CONNECTED' });
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit(data);
            } catch (err) {
                console.error('Failed to parse Zupa event', err);
            }
        };

        this.ws.onclose = () => {
            this.ws = null;
            this.emit({ type: 'DISCONNECTED' });
            if (!this.isExplicitlyClosed) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            this.emit({ type: 'ERROR', payload: { message: 'WebSocket communication error' } });
        };
    }

    public disconnect() {
        this.isExplicitlyClosed = true;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    public send(type: string, payload: unknown) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('ZupaConnection: Not connected');
        }
        this.ws.send(JSON.stringify({ type, payload }));
    }

    public subscribe(handler: (event: ZupaEvent) => void) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    private emit(event: ZupaEvent) {
        for (const handler of this.handlers) {
            handler(event);
        }
    }

    private scheduleReconnect() {
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        this.retryCount++;
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
    }
}
