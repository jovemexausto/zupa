export interface StateSnapshot<TChannelValues = Record<string, unknown>> {
    values: TChannelValues;
    metadata: {
        step: number;
        source: string;
        writes: Record<string, unknown>;
    };
    checkpointId: string;
    parentCheckpointId?: string;
    createdAt: Date;
    nextTasks: string[];
}

export interface CheckpointSaver<TState = Record<string, unknown>> {
    putCheckpoint(threadId: string, snapshot: StateSnapshot<TState>): Promise<void>;
    getCheckpoint(threadId: string): Promise<StateSnapshot<TState> | null>;
    getCheckpointById(threadId: string, checkpointId: string): Promise<StateSnapshot<TState> | null>;
    getCheckpointHistory(threadId: string): Promise<StateSnapshot<TState>[]>;
}
