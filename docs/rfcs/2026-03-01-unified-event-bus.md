# RFC: ReducerEventBus & Asynchronous System Observability

## 1. Problem Statement

Currently, Zupa's internal observability—spanning telemetry, system logs, and dashboard updates—is fragmented and partially synchronous:

- **Telemetry:** Events are collected in a buffer and bulk-emitted from a dedicated engine node.
- **Node Transitions:** Hardcoded hooks in the `EngineExecutor` call specific telemetry or UI methods.
- **Coupling:** The `AgentRuntime` and `EngineExecutor` have direct dependencies on multiple sinks.

## 2. The Vision: The Zupa ReducerEventBus

We propose the **ReducerEventBus** as the central nervous system for all non-interactive background events.

### Key Principles
- **Namespace Pattern:** Events follow a `channel:name` pattern.
- **Zero-Latency Ingestion:** The `emit()` method is a pure fire-and-forget operation. It merely pushes the raw payload into a high-speed internal **Ingest Queue** and returns `void` instantly.
- **Asynchronous Pipeline:** The Reducer Pipeline and Sink Dispatcher run in a separate background context, decoupled from the calling thread (the engine execution).
- **Monotonic Sequencing:** Sequence IDs and timestamps are assigned when an event is dequeued for processing, ensuring order while keeping ingestion ultra-fast.
- **Middleware & Reducer Logic:** Supports registering global or scoped "Reducers" that can transform, filter, or route events asynchronously.

## 3. Core Architecture

### A. The Bus Port (`@zupa/core`)
```typescript
/**
 * Central event distributor with internal queuing and reducer support.
 */
export interface EventBus extends RuntimeResource {
  /**
   * Non-blocking emission of a system event. 
   * Returns instantly; the event is buffered for background processing.
   */
  emit(event: Omit<ZupaEvent, 'seq' | 'timestamp'>): void;
  
  /**
   * Connect custom logic (Reducers/Middleware).
   * Reducers run asynchronously in the background pipeline.
   */
  use(reducer: (event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null): void;

  /**
   * Register a scoped sink for specific channels or wildcards.
   */
  subscribe(pattern: string, handler: (event: ZupaEvent) => void): () => void;
}
```

### B. The Background Pipeline (`@zupa/runtime`)
The `ReducerEventBus` maintains two separate stages:

1. **Ingest Stage (Sync):** `emit()` pushes to the `IngestQueue`. Time: < 1ms.
2. **Execution Stage (Async):** A background loop pulls from the queue, executes the Reducer Pipeline, assigns `seq` and `timestamp`, and then dispatches to subscribers.

### C. Example Usage
```typescript
// Custom logic (runs in the background)
bus.use((event) => {
    if (event.channel === 'telemetry' && event.name === 'node_transition') {
        return {
            ...event,
            channel: 'agent',
            name: 'log',
            payload: { message: `Entering node: ${event.payload.node}` }
        };
    }
    return event;
});
```

## 4. Why This Matters

### 1. Engine Performance
The `EngineExecutor` is never slowed down by observability. Whether you have 1 or 100 sinks/reducers, the impact on the core interaction loop is exactly the same: a single array push.

### 2. Scalable Observability
Since reducers and sinks run in the background, they can perform expensive operations (like formatting complex logs or even small I/O tasks) without affecting the agent's response latency.

### 3. Unified DX
The Dashboard and Telemetry derive from the same asynchronous stream, guaranteeing consistency without compromising speed.

---

## 5. Implementation Roadmap

### Phase 1: Ingest & Background Worker
- Implement `ReducerEventBus` with a dedicated background event loop.
- Decouple `emit()` from the reducer execution.

### Phase 2: Core Refactor & Instrumentation
- Transition `DashboardProvider` and `TelemetrySink` to the new bus.
- Update `EngineExecutor` to use the unified `emit()`.

---

## 6. Design Decisons & Tradeoffs

- **High-Watermark Drop Policy:** To protect memory, if the `IngestQueue` exceeds its limit, the bus will drop new events (telemetry is non-critical infrastructure).
- **Ordering:** Sequencing occurs at the start of the Background Stage to provide a stable history for consumers.
- **Async Uncertainty:** Because dispatch is async, a system-crash might lose the most recent buffered events. This is an acceptable tradeoff for the performance gains in conversational AI.
