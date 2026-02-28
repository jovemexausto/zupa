import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * event_dedup_gate — the very first node in the runtime graph.
 *
 * Calls `database.claimInboundEvent(inbound.messageId)` which performs an
 * atomic upsert in the backing store (SQLite `processed_events` table or
 * in-memory set for tests). If the event was already processed, the node
 * short-circuits by setting `inboundDuplicate: true` and routing to
 * `telemetry_emit`, skipping all business logic.
 *
 * This guarantees exactly-once effect for all downstream nodes:
 *   - No duplicate messages persisted to history
 *   - No duplicate LLM calls
 *   - No duplicate outbound messages sent to the user
 *
 * Dedup key: `inbound.messageId` (required since the InboundMessage RFC update)
 */
export const eventDedupGateNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
    const messageId = context.inbound.messageId;
    const result = await context.resources.database.claimInboundEvent(messageId);

    if (result === 'duplicate') {
        return {
            stateDiff: { inboundDuplicate: true },
            nextTasks: ['telemetry_emit']
        };
    }

    return {
        stateDiff: { inboundDuplicate: false },
        nextTasks: ['access_policy']
    };
});
