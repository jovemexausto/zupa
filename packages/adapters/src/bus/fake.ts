import { EventBus, ZupaEvent } from "@zupa/core";

export class FakeEventBus implements EventBus {
    public events: Array<Omit<ZupaEvent<any>, 'seq' | 'timestamp'>> = [];
    public reducers: Array<(event: ZupaEvent<any>) => ZupaEvent<any> | ZupaEvent<any>[] | null> = [];
    public subscribers: Map<string, Array<(event: ZupaEvent<any>) => void>> = new Map();

    public async start(): Promise<void> {
        // No-op
    }

    public async close(): Promise<void> {
        // No-op
    }

    public emit<T = any>(event: Omit<ZupaEvent<T>, 'seq' | 'timestamp'>): void {
        this.events.push(event as any);
    }

    public use(reducer: (event: ZupaEvent<any>) => ZupaEvent<any> | ZupaEvent<any>[] | null): void {
        this.reducers.push(reducer);
    }

    public subscribe<T = any>(pattern: string, handler: (event: ZupaEvent<T>) => void): () => void {
        if (!this.subscribers.has(pattern)) {
            this.subscribers.set(pattern, []);
        }
        const h = handler as (event: ZupaEvent<any>) => void;
        this.subscribers.get(pattern)!.push(h);
        return () => {
            const list = this.subscribers.get(pattern);
            if (list) {
                this.subscribers.set(pattern, list.filter(item => item !== h));
            }
        };
    }
}
