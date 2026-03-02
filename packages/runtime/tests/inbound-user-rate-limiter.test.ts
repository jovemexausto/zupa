import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReducerEventBus } from "../src/bus/ReducerEventBus";
import { createInboundUserRateLimiter } from "../src/bus/InboundUserRateLimiter";
import { InboundMessage } from "@zupa/core";

const flushPromises = () => new Promise(setImmediate);

describe("InboundUserRateLimiter", () => {
    let bus: ReducerEventBus;

    beforeEach(async () => {
        bus = new ReducerEventBus();
        await bus.start();
    });

    afterEach(async () => {
        await bus.stop();
    });

    it("should allow events within rate limit", async () => {
        const handler = vi.fn();
        bus.subscribe("transport:inbound", handler);

        const limiter = createInboundUserRateLimiter(bus, 2);
        bus.use(limiter);

        const msg: InboundMessage = { messageId: "1", from: "user1", body: "msg 1", source: "transport" };
        bus.emit({ channel: "transport", name: "inbound", payload: msg });
        bus.emit({ channel: "transport", name: "inbound", payload: { ...msg, messageId: "2" } });

        await flushPromises();
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should drop events exceeding rate limit and emit ratelimited event", async () => {
        const handler = vi.fn();
        const rateLimitHandler = vi.fn();
        bus.subscribe("transport:inbound", handler);
        bus.subscribe("transport:inbound:ratelimited", rateLimitHandler);

        const limiter = createInboundUserRateLimiter(bus, 1);
        bus.use(limiter);

        const msg1: InboundMessage = { messageId: "1", from: "user1", body: "msg 1", source: "transport" };
        const msg2: InboundMessage = { messageId: "2", from: "user1", body: "msg 2", source: "transport" };

        bus.emit({ channel: "transport", name: "inbound", payload: msg1 });
        bus.emit({ channel: "transport", name: "inbound", payload: msg2 });

        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(rateLimitHandler).toHaveBeenCalledTimes(1);
        expect(rateLimitHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: { inbound: msg2 },
            }),
        );
    });

    it("should enforce rate limits per user", async () => {
        const handler = vi.fn();
        bus.subscribe("transport:inbound", handler);

        const limiter = createInboundUserRateLimiter(bus, 1);
        bus.use(limiter);

        bus.emit({ channel: "transport", name: "inbound", payload: { from: "user1", body: "msg 1" } });
        bus.emit({ channel: "transport", name: "inbound", payload: { from: "user2", body: "msg 1" } });
        bus.emit({ channel: "transport", name: "inbound", payload: { from: "user1", body: "msg 2" } });

        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(2); // user1's first, user2's first. user1's second dropped.
    });
});
