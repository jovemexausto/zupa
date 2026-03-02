import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReducerEventBus } from "../src/bus/ReducerEventBus";
import { createInboundConcurrencyLimiter } from "../src/bus/InboundConcurrencyLimiter";

const flushPromises = () => new Promise(setImmediate);

describe("InboundConcurrencyLimiter", () => {
  let bus: ReducerEventBus;

  beforeEach(async () => {
    bus = new ReducerEventBus();
    await bus.start();
  });

  afterEach(async () => {
    await bus.stop();
  });

  it("should allow events within concurrency limit", async () => {
    const handler = vi.fn();
    bus.subscribe("transport:inbound", handler);

    const limiter = createInboundConcurrencyLimiter(bus, 2);
    bus.use(limiter);

    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 1" } });
    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 2" } });

    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should drop events exceeding concurrency limit and emit overload", async () => {
    const handler = vi.fn();
    const overloadHandler = vi.fn();
    bus.subscribe("transport:inbound", handler);
    bus.subscribe("transport:inbound:overload", overloadHandler);

    const limiter = createInboundConcurrencyLimiter(bus, 1);
    bus.use(limiter);

    bus.emit({ channel: "transport", name: "inbound", payload: { from: "user1", body: "msg 1" } });
    bus.emit({ channel: "transport", name: "inbound", payload: { from: "user1", body: "msg 2" } });

    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(overloadHandler).toHaveBeenCalledTimes(1);
    expect(overloadHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { inbound: expect.objectContaining({ body: "msg 2" }) },
      }),
    );
  });

  it("should allow more events after completion events are received", async () => {
    const handler = vi.fn();
    bus.subscribe("transport:inbound", handler);

    const limiter = createInboundConcurrencyLimiter(bus, 1);
    bus.use(limiter);

    // First event uses up the capacity
    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 1" } });
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1);

    // Second event is dropped
    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 2" } });
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1); // Still 1

    // Complete the first event
    bus.emit({ channel: "runtime", name: "inbound:processed", payload: {} });
    await flushPromises();

    // Third event should now be allowed
    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 3" } });
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should also allow more events after failure events are received", async () => {
    const handler = vi.fn();
    bus.subscribe("transport:inbound", handler);

    const limiter = createInboundConcurrencyLimiter(bus, 1);
    bus.use(limiter);

    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 1" } });
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(1);

    bus.emit({ channel: "runtime", name: "inbound:failed", payload: {} });
    await flushPromises();

    bus.emit({ channel: "transport", name: "inbound", payload: { body: "msg 2" } });
    await flushPromises();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
