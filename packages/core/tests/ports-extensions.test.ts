import { describe, it } from "vitest";
import { type InboundMessage, type LLMProvider, type LLMStreamChunk } from "../src/ports";

describe("Core Ports Extensions Type Compliance", () => {
    it("verifies InboundMessage requires source", () => {
        const msg: InboundMessage = {
            messageId: "123",
            from: "alice",
            body: "hello",
            source: "transport",
        };

        const uiMsg: InboundMessage = {
            messageId: "456",
            from: "bob",
            body: "ping",
            source: "ui_channel",
            clientId: "ws-1",
        };

        void msg;
        void uiMsg;
    });

    it("verifies LLMProvider supports optional stream", () => {
        const provider: LLMProvider = {
            complete: async () => ({
                content: "done",
                structured: null,
                toolCalls: [],
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
                model: "test",
                latencyMs: 0
            }),
            stream: async function* (options: any) {
                yield { id: "1", content: "hello" } as LLMStreamChunk;
                return {
                    content: "done",
                    structured: null,
                    toolCalls: [],
                    tokensUsed: { promptTokens: 0, completionTokens: 0 },
                    model: "test",
                    latencyMs: 0
                };
            }
        };

        void provider;
    });
});
