import type { CheckpointSaver, LedgerEvent, LedgerWriter, StateSnapshot } from '@zupa/core';
import type { RuntimeState } from '../nodes';

/**
 * In-process checkpoint saver (ephemeral, per-request thread).
 * 
 * Provides an in-memory implementation for state tracking and ledger events.
 * It is primarily used during single-request executions where persistent checkpoints
 * and full audit ledgers are not required or are managed externally.
 */
export class EphemeralCheckpointSaver implements CheckpointSaver<RuntimeState>, LedgerWriter {
    private checkpoints = new Map<string, StateSnapshot<RuntimeState>>();

    async getCheckpoint(threadId: string): Promise<StateSnapshot<RuntimeState> | null> {
        return this.checkpoints.get(threadId) ?? null;
    }

    async putCheckpoint(threadId: string, checkpoint: StateSnapshot<RuntimeState>): Promise<void> {
        this.checkpoints.set(threadId, checkpoint);
    }

    async getCheckpointById(_threadId: string, checkpointId: string): Promise<StateSnapshot<RuntimeState> | null> {
        for (const cp of this.checkpoints.values()) {
            if (cp.checkpointId === checkpointId) return cp;
        }
        return null;
    }

    async getCheckpointHistory(_threadId: string): Promise<StateSnapshot<RuntimeState>[]> {
        return [];
    }

    async appendLedgerEvent(_sessionId: string, _event: LedgerEvent): Promise<void> {
        // No-op in ephemeral path
    }
}
