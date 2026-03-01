import { describe, expect, it, vi } from "vitest";
import { FakeMessagingTransport } from "@zupa/adapters";
import { bindTransportInbound } from "../src/inbound/transportBridge";

describe("bindTransportInbound — concurrency limiting", () => {
  it("processes messages up to maxConcurrent without overload", async () => {
    const transport = new FakeMessagingTransport();
    let processed = 0;

    const binding = bindTransportInbound({
      transport,
      maxConcurrent: 2,
      runInboundEngine: async () => {
        processed++;
      },
    });

    await transport.simulateInbound({ from: "u1", body: "msg1" });
    await transport.simulateInbound({ from: "u2", body: "msg2" });

    expect(processed).toBe(2);
    expect(binding.inFlightCount).toBe(0); // both finished

    binding.stop();
  });

  it("calls onOverload when at max concurrency", async () => {
    const transport = new FakeMessagingTransport();
    let overloaded = 0;
    const overloadedMessages: string[] = [];

    // Use a deferred engine so we can control when slots are released
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      release: {
        // capture resolveRelease into releaseFirst
        releaseFirst = resolve;
      }
    });

    let engineCallCount = 0;

    const binding = bindTransportInbound({
      transport,
      maxConcurrent: 1,
      runInboundEngine: async (inbound) => {
        engineCallCount++;
        if (engineCallCount === 1) {
          // Block until released
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
      },
      onOverload: async (inbound) => {
        overloaded++;
        overloadedMessages.push(inbound.body);
      },
    });

    // Start first message (will block)
    const first = transport.simulateInbound({ from: "u1", body: "first" });

    // Give first a tick to start and increment inFlight
    await new Promise((r) => setTimeout(r, 5));
    expect(binding.inFlightCount).toBe(1);

    // Second message should hit the overload gate immediately
    await transport.simulateInbound({ from: "u2", body: "second" });

    expect(overloaded).toBe(1);
    expect(overloadedMessages).toContain("second");

    // Release the first and wait for completion
    releaseFirst();
    await first;

    expect(binding.inFlightCount).toBe(0);
    binding.stop();
  });

  it("inFlightCount decrements even when engine throws", async () => {
    const transport = new FakeMessagingTransport();
    const errors: unknown[] = [];

    const binding = bindTransportInbound({
      transport,
      maxConcurrent: 5,
      runInboundEngine: async () => {
        throw new Error("engine failure");
      },
      onError: (err) => {
        errors.push(err);
      },
    });

    await transport.simulateInbound({ from: "u1", body: "msg" });

    expect(binding.inFlightCount).toBe(0); // decremented in finally
    expect(errors.length).toBe(1);

    binding.stop();
  });

  it("stops accepting new messages after stop()", async () => {
    const transport = new FakeMessagingTransport();
    let processed = 0;

    const binding = bindTransportInbound({
      transport,
      runInboundEngine: async () => {
        processed++;
      },
    });

    await transport.simulateInbound({ from: "u1", body: "msg1" });
    expect(processed).toBe(1);

    binding.stop();
    expect(transport.inboundUnsubscriptions).toBe(1);
  });
});
