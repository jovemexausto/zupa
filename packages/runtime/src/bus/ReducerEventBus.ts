import { EventBus, ZupaEvent } from "@zupa/core";

/**
 * Implementation of the ReducerEventBus with zero-latency ingestion
 * and asynchronous background processing.
 */
export class ReducerEventBus implements EventBus {
    private ingestQueue: Omit<ZupaEvent, "seq" | "timestamp">[] = [];
    private reducers: ((event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null)[] = [];
    private subscribers: { pattern: string; regex: RegExp; handler: (event: ZupaEvent) => void }[] = [];
    private nextSeq = 1;
    private isRunning = false;
    private workerPromise: Promise<void> | null = null;

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        this.workerPromise = this.runWorker();
    }

    async stop(): Promise<void> {
        this.isRunning = false;
        await this.workerPromise;
    }

    emit(event: Omit<ZupaEvent, "seq" | "timestamp">): void {
        // Zero-latency ingestion: just push to the queue
        this.ingestQueue.push(event);
    }

    use(reducer: (event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null): void {
        this.reducers.push(reducer);
    }

    subscribe(pattern: string, handler: (event: ZupaEvent) => void): () => void {
        const regex = this.patternToRegex(pattern);
        const entry = { pattern, regex, handler };
        this.subscribers.push(entry);
        return () => {
            this.subscribers = this.subscribers.filter((s) => s !== entry);
        };
    }

    private async runWorker() {
        while (this.isRunning) {
            if (this.ingestQueue.length === 0) {
                // Yield to event loop if queue is empty
                await new Promise((resolve) => setImmediate(resolve));
                continue;
            }

            const rawEvent = this.ingestQueue.shift();
            if (!rawEvent) continue;

            // Assign sequence and timestamp in the background stage
            const event: ZupaEvent = {
                ...rawEvent,
                seq: this.nextSeq++,
                timestamp: new Date().toISOString(),
            };

            // Process through reducers
            const processedEvents = this.applyReducers(event);

            // Dispatch to subscribers
            for (const e of processedEvents) {
                this.dispatch(e);
            }
        }
    }

    private applyReducers(event: ZupaEvent): ZupaEvent[] {
        let currentEvents: ZupaEvent[] = [event];

        for (const reducer of this.reducers) {
            const nextIteration: ZupaEvent[] = [];
            for (const e of currentEvents) {
                const result = reducer(e);
                if (result === null) continue;
                if (Array.isArray(result)) {
                    nextIteration.push(...result);
                } else {
                    nextIteration.push(result);
                }
            }
            currentEvents = nextIteration;
        }

        return currentEvents;
    }

    private dispatch(event: ZupaEvent) {
        const key = `${event.channel}:${event.name}`;
        for (const sub of this.subscribers) {
            if (sub.regex.test(key)) {
                try {
                    sub.handler(event);
                } catch (err) {
                    // Internal bus error: don't block the loop
                    console.error(`[ReducerEventBus] Subscriber error for ${key}:`, err);
                }
            }
        }
    }

    private patternToRegex(pattern: string): RegExp {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // escape regex chars
        const withWildcards = escaped.replace(/\*/g, ".*");
        return new RegExp(`^${withWildcards}$`);
    }
}
