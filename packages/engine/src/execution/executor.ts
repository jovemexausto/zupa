import type {
    StateSnapshot,
    CheckpointSaver,
    LedgerEvent,
    LedgerWriter,
    NodeResult,
    Logger
} from '@zupa/core';

interface ExecutorContextWithLogger {
    resources?: {
        logger?: Logger;
    }
}
import type { ChannelReducer } from '../models/checkpoint';

/**
 * Defines the structure and reducer behavior of the execution graph.
 */
export interface EngineGraphSpec<TState extends object, TContext = unknown> {
    /** Map of state channels to their respective reducers. */
    channels: { [K in keyof TState]: ChannelReducer<TState[K]> };

    /** Map of node names to their pure execution handlers. */
    nodes: Record<string, (context: TContext & { state: Readonly<TState> }) => Promise<NodeResult<Partial<TState>>>>;
}

export class GraphInterrupt extends Error {
    constructor(public readonly reason: string, public readonly payload?: unknown) {
        super(`Graph execution interrupted: ${reason}`);
        this.name = 'GraphInterrupt';
    }
}

export interface EngineExecutorConfig<TState = Record<string, unknown>> {
    threadId: string;
    saver: CheckpointSaver<TState> & LedgerWriter;
    entrypoint?: string;
}

export class EngineExecutor<TState extends object, TContext = unknown> {
    constructor(private readonly graph: EngineGraphSpec<TState, TContext>) { }

    /**
     * Invokes the execution graph for a given thread.
     * Resumes from the latest checkpoint if one exists.
     */
    public async invoke(
        input: Partial<TState>,
        context: TContext,
        config: EngineExecutorConfig<TState>
    ): Promise<StateSnapshot<TState>> {
        const { threadId, saver } = config;
        const logger = (context as ExecutorContextWithLogger).resources?.logger?.child({ threadId });

        logger?.debug('Starting graph execution');

        let checkpoint = await saver.getCheckpoint(threadId) as StateSnapshot<TState> | null;

        if (!checkpoint) {
            // Bootstrap initial checkpoint
            const startTasks = config.entrypoint ? [config.entrypoint] : [Object.keys(this.graph.nodes)[0] as string];

            checkpoint = {
                checkpointId: crypto.randomUUID(),
                values: this.applyReducers({} as TState, input),
                metadata: { step: 0, source: 'input', writes: {} },
                createdAt: new Date(),
                nextTasks: startTasks
            };
            await saver.putCheckpoint(threadId, checkpoint);
        } else {
            // If we are resuming with new input, apply it as a reducer write before starting
            if (Object.keys(input).length > 0) {
                checkpoint.values = this.applyReducers(checkpoint.values, input);
            }
            // CRITICAL: If an entrypoint is explicitly provided, we override the nextTasks
            // to start a new execution turn from that node, while preserving values.
            if (config.entrypoint) {
                checkpoint.nextTasks = [config.entrypoint];
            }
        }

        let currentCheckpoint = checkpoint!;

        // The Pregel Super-Step Loop
        let loopCount = 0;
        // TODO: Make this configurable and with safe defaults
        const MAX_STEPS = 50; // Guard against infinite cycles

        while (currentCheckpoint.nextTasks.length > 0) {
            if (loopCount++ > MAX_STEPS) {
                throw new Error(`Graph Execution Error: Max steps (${MAX_STEPS}) exceeded for thread ${threadId}`);
            }

            const currentTasks = [...currentCheckpoint.nextTasks];
            const writes: Partial<TState> = {};
            const ledgerEvents: LedgerEvent[] = [];
            const completedTasks: string[] = [];

            logger?.trace({ step: loopCount, tasks: currentTasks }, 'Executing super-step');

            // 1. Parallel Execution Node (Super-step)
            // Nodes receive a read-only snapshot of the current state.
            const snapshotContext = Object.assign({}, context, { state: Object.freeze({ ...currentCheckpoint.values }) }) as TContext & { state: Readonly<TState> };

            let interrupted = false;
            let dynamicNextTasks: string[] | undefined;

            try {
                await Promise.all(
                    currentTasks.map(async (taskName) => {
                        const nodeHandler = this.graph.nodes[taskName];
                        if (!nodeHandler) {
                            throw new Error(`Graph Execution Error: Node ${taskName} not found.`);
                        }

                        const result = await nodeHandler(snapshotContext);

                        Object.assign(writes, result.stateDiff);
                        if (result.ledgerEvents) {
                            ledgerEvents.push(...result.ledgerEvents);
                        }
                        if (result.nextTasks) {
                            dynamicNextTasks = result.nextTasks;
                        }
                        completedTasks.push(taskName);
                        logger?.trace({ node: taskName }, 'Node completed');
                    })
                );
            } catch (err) {
                if (err instanceof GraphInterrupt) {
                    interrupted = true;
                } else {
                    throw err; // Propagate real crashes, do not advance checkpoint.
                }
            }

            // 2. Barrier Commit
            const nextValues = this.applyReducers(currentCheckpoint.values, writes);

            let nextTasks: string[] = [];
            if (interrupted) {
                nextTasks = currentTasks.filter(t => !completedTasks.includes(t));
            } else if (dynamicNextTasks !== undefined) {
                nextTasks = dynamicNextTasks;
            } else {
                nextTasks = [];
            }

            const nextCheckpoint: StateSnapshot<TState> = {
                checkpointId: crypto.randomUUID(),
                parentCheckpointId: currentCheckpoint.checkpointId,
                values: nextValues,
                metadata: {
                    step: currentCheckpoint.metadata.step + 1,
                    source: interrupted ? 'interrupted' : 'loop',
                    writes
                },
                createdAt: new Date(),
                nextTasks
            };

            // 3. Dual-Write Persistence
            if (ledgerEvents.length > 0) {
                await saver.appendLedgerEvent(threadId, ledgerEvents[0]!); // Simple single event for now, should be bulk
            }
            await saver.putCheckpoint(threadId, nextCheckpoint);

            currentCheckpoint = nextCheckpoint;

            if (interrupted) {
                logger?.warn({ step: loopCount }, 'Graph execution interrupted');
                break;
            }
        }

        logger?.debug({ steps: loopCount }, 'Graph execution complete');
        return currentCheckpoint;
    }

    public async resume(
        payload: Partial<TState>,
        context: TContext,
        config: EngineExecutorConfig<TState>
    ): Promise<StateSnapshot<TState>> {
        const { threadId, saver } = config;
        const checkpoint = await saver.getCheckpoint(threadId);

        if (!checkpoint) {
            throw new Error(`Cannot resume thread ${threadId}: No checkpoint found.`);
        }

        if (checkpoint.nextTasks.length === 0) {
            throw new Error(`Cannot resume thread ${threadId}: Execution is already complete.`);
        }

        return this.invoke(payload, context, config); // Checkpoint saver cast is already handled in invoke
    }

    private applyReducers(current: TState, writes: Partial<TState>): TState {
        const next = { ...current };
        for (const [key, value] of Object.entries(writes)) {
            const reducer = this.graph.channels[key as keyof TState];
            if (reducer) {
                next[key as keyof TState] = reducer(current[key as keyof TState], value as any);
            } else {
                next[key as keyof TState] = value as any;
            }
        }
        return next;
    }
}
