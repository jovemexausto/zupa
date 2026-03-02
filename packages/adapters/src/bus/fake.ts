import { EventBus, ZupaEvent } from "@zupa/core";

export class FakeEventBus implements EventBus {
    public events: Array<Omit<ZupaEvent, 'seq' | 'timestamp'>> = [];
    public reducers: Array<(event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null> = [];
    public subscribers: Map<string, Array<(event: ZupaEvent) => void>> = new Map();

    public async start(): Promise<void> {
        // No-op
    }

    public async close(): Promise<void> {
        // No-op
    }

    public emit(event: Omit<ZupaEvent, 'seq' | 'timestamp'>): void {
        this.events.push(event);
    }

    public use(reducer: (event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null): void {
        this.reducers.push(reducer);
    }

    public subscribe(pattern: string, handler: (event: ZupaEvent) => void): () => void {
        if (!this.subscribers.has(pattern)) {
            this.subscribers.set(pattern, []);
        }
        this.subscribers.get(pattern)!.push(handler);
        return () => {
            const list = this.subscribers.get(pattern);
            if (list) {
                this.subscribers.set(pattern, list.filter(h => h !== handler));
            }
        };
    }
}
