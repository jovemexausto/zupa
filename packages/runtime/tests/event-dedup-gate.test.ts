import { describe, expect, it } from 'vitest';
import {
    createFakeRuntimeDeps,
    createFakeRuntimeConfig,
    DEFAULT_INBOUND,
    createFakeLLMResponse
} from '@zupa/testing';
import { FakeDatabaseBackend, FakeLLMProvider, FakeMessagingTransport } from '@zupa/adapters';
import { AgentRuntime } from '../src/index';

describe('event_dedup_gate', () => {
    it('processes a new message normally (claimed)', async () => {
        const deps = createFakeRuntimeDeps();
        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps
        });
        await runtime.start();

        await runtime.runInbound(DEFAULT_INBOUND);

        // The messageId should now exist in the dedup ledger
        const db = deps.database as FakeDatabaseBackend;
        expect(db.claimedInboundEvents.has(DEFAULT_INBOUND.messageId)).toBe(true);

        await runtime.close();
    });

    it('silently drops a duplicate message (same messageId)', async () => {
        const deps = createFakeRuntimeDeps();
        const llm = deps.llm as FakeLLMProvider;
        // Provide two distinct responses so we'd notice if LLM was called twice
        llm.setResponses([
            createFakeLLMResponse({ structured: { reply: 'first' } }),
            createFakeLLMResponse({ structured: { reply: 'second' } })
        ]);

        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps
        });
        await runtime.start();

        // Send the same messageId twice (simulating platform redelivery)
        await runtime.runInbound(DEFAULT_INBOUND);
        await runtime.runInbound(DEFAULT_INBOUND); // duplicate — should be dropped

        // Only one outbound reply — the second run was short-circuited by the dedup gate
        const transport = deps.transport as FakeMessagingTransport;
        expect(transport.sentText.length).toBe(1);

        await runtime.close();
    });

    it('processes two different messages independently', async () => {
        const deps = createFakeRuntimeDeps();
        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps
        });
        await runtime.start();

        await runtime.runInbound({ ...DEFAULT_INBOUND, messageId: 'msg-aaa' });
        await runtime.runInbound({ ...DEFAULT_INBOUND, messageId: 'msg-bbb' });

        const db = deps.database as FakeDatabaseBackend;
        expect(db.claimedInboundEvents.has('msg-aaa')).toBe(true);
        expect(db.claimedInboundEvents.has('msg-bbb')).toBe(true);

        const transport = deps.transport as FakeMessagingTransport;
        expect(transport.sentText.length).toBe(2);

        await runtime.close();
    });
});
