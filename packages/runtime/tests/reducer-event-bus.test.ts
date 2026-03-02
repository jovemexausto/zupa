import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { ReducerEventBus } from "../src/bus/ReducerEventBus";
import { ZupaEvent } from "@zupa/core";

const flushPromises = () => new Promise(setImmediate);

describe("ReducerEventBus", () => {
    let bus: ReducerEventBus;

    beforeEach(async () => {
        bus = new ReducerEventBus();
        await bus.start();
    });

    afterEach(async () => {
        await bus.stop();
    });

    it("should process and dispatch an emitted event asynchronously", async () => {
        const handler = vi.fn();
        bus.subscribe("test:event", handler);

        bus.emit({ channel: "test", name: "event", payload: { data: 123 } });

        // Immediately, it shouldn't be called because it's async
        expect(handler).not.toHaveBeenCalled();

        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        const event = (handler as Mock).mock.calls[0]![0] as ZupaEvent;
        expect(event.channel).toBe("test");
        expect(event.name).toBe("event");
        expect(event.payload).toEqual({ data: 123 });
        expect(event.seq).toBeGreaterThan(0);
        expect(event.timestamp).toBeDefined();
    });

    it("should allow reducers to map/transform events", async () => {
        const handler = vi.fn();
        bus.subscribe("test:event", handler);

        bus.use((event) => {
            if (event.name === "event") {
                return {
                    ...event,
                    payload: { ...event.payload as any, mutated: true }
                };
            }
            return event;
        });

        bus.emit({ channel: "test", name: "event", payload: {} });
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(((handler as Mock).mock.calls[0]![0] as ZupaEvent).payload).toEqual({ mutated: true });
    });

    it("should allow reducers to filter (drop) events", async () => {
        const handler = vi.fn();
        bus.subscribe("test:event", handler);

        bus.use((event) => {
            if (event.name === "event" && (event.payload as any).dropMe) {
                return null;
            }
            return event;
        });

        bus.emit({ channel: "test", name: "event", payload: { dropMe: true } });
        bus.emit({ channel: "test", name: "event", payload: { dropMe: false } });
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(((handler as Mock).mock.calls[0]![0] as ZupaEvent).payload).toEqual({ dropMe: false });
    });

    it("should allow reducers to emit multiple events (flatmap)", async () => {
        const handler = vi.fn();
        bus.subscribe("test:*", handler);

        bus.use((event) => {
            if (event.name === "split") {
                return [
                    { ...event, name: "part1" },
                    { ...event, name: "part2" }
                ];
            }
            return event;
        });

        bus.emit({ channel: "test", name: "split", payload: {} });
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(2);
        expect(((handler as Mock).mock.calls[0]![0] as ZupaEvent).name).toBe("part1");
        expect(((handler as Mock).mock.calls[1]![0] as ZupaEvent).name).toBe("part2");
    });

    it("should unsubscribe correctly", async () => {
        const handler = vi.fn();
        const unsubscribe = bus.subscribe("test:event", handler);

        bus.emit({ channel: "test", name: "event", payload: { step: 1 } });
        await flushPromises();
        expect(handler).toHaveBeenCalledTimes(1);

        unsubscribe();

        bus.emit({ channel: "test", name: "event", payload: { step: 2 } });
        await flushPromises();
        expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should match wildcard patterns", async () => {
        const handler = vi.fn();
        bus.subscribe("system:*", handler);

        bus.emit({ channel: "system", name: "boot", payload: {} });
        bus.emit({ channel: "system", name: "shutdown", payload: {} });
        bus.emit({ channel: "other", name: "ignored", payload: {} });

        await flushPromises();
        expect(handler).toHaveBeenCalledTimes(2);
    });
});
