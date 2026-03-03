import { describe, it, expect } from "vitest";
import {
    createFakeRuntimeDeps,
    createFakeRuntimeConfig,
    FakeMessagingTransport,
    FakeLLMProvider,
    DEFAULT_INBOUND,
    createFakeLLMResponse,
} from "@zupa/testing";
import { AgentRuntime } from "../src/index";
import { ReducerEventBus } from "../src/bus/ReducerEventBus";

const flushPromises = () => new Promise(setImmediate);

describe("AgentRuntime Rejections", () => {
    it("should send a rate limit message when transport:inbound:ratelimited is emitted", async () => {
        const bus = new ReducerEventBus();
        await bus.start();

        const deps = createFakeRuntimeDeps();
        deps.bus = bus;

        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig({
                rateLimitMessage: "Slow down, buddy!",
                rateLimitPerUserPerMinute: 1,
            }),
            runtimeResources: deps,
        });

        await runtime.start();

        // Trigger rate limit via middleware
        deps.bus.emit({
            channel: "transport",
            name: "inbound",
            payload: { ...DEFAULT_INBOUND, from: "user1", messageId: "1" }
        });
        deps.bus.emit({
            channel: "transport",
            name: "inbound",
            payload: { ...DEFAULT_INBOUND, from: "user1", messageId: "2" }
        });

        // Wait for the async chain to complete
        for (let i = 0; i < 20; i++) await flushPromises();

        const transport = deps.transport as FakeMessagingTransport;
        const sent = transport.getSentMessages();

        // Should have sent the rate limit text
        expect(sent.some(m => m.text === "Slow down, buddy!")).toBe(true);

        await runtime.close();
        await bus.stop();
    });

    it("should send an overload message when transport:inbound:overload is emitted", async () => {
        const bus = new ReducerEventBus();
        await bus.start();

        const deps = createFakeRuntimeDeps();
        deps.bus = bus;

        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig({
                overloadMessage: "Too many messages!",
                maxInboundConcurrency: 1,
            }),
            runtimeResources: deps,
        });

        await runtime.start();

        // Trigger overload via middleware
        deps.bus.emit({
            channel: "transport",
            name: "inbound",
            payload: { ...DEFAULT_INBOUND, from: "user1", messageId: "1" }
        });
        // This second one should trigger overload since concurrency is 1
        deps.bus.emit({
            channel: "transport",
            name: "inbound",
            payload: { ...DEFAULT_INBOUND, from: "user2", messageId: "2" }
        });

        // Wait for the async chain to complete
        for (let i = 0; i < 20; i++) await flushPromises();

        const transport = deps.transport as FakeMessagingTransport;
        const sent = transport.getSentMessages();

        // Should have sent the overload text
        expect(sent.some(m => m.text === "Too many messages!")).toBe(true);

        await runtime.close();
        await bus.stop();
    });

    it("sends fallback reply once when inbound fails before outbound send", async () => {
        const deps = createFakeRuntimeDeps();
        const llm = deps.llm as FakeLLMProvider;
        llm.setResponses([
            createFakeLLMResponse({
                content: "this should never be sent",
                structured: { reply: "this should never be sent" },
            }),
        ]);
        llm.complete = async () => {
            throw new Error("LLM is down");
        };

        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig({
                fallbackReply: "Temporary issue. Please try again soon.",
            }),
            runtimeResources: deps,
        });

        await runtime.start();
        await runtime.runInbound({ ...DEFAULT_INBOUND, messageId: "fallback-pre-send-1" });

        const transport = deps.transport as FakeMessagingTransport;
        const sent = transport.getSentMessages();
        const fallbackMessages = sent.filter((m) => m.text === "Temporary issue. Please try again soon.");
        expect(fallbackMessages).toHaveLength(1);
        expect(sent.some((m) => m.text === "this should never be sent")).toBe(false);

        await runtime.close();
    });
});
