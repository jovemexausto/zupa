# RFC: A Unified Event Machine (Converging EventEmitter and ReducerEventBus)

## 1. Introduction
Zupa currently operates on a dual-track event system. The `AgentRuntime` utilizes a synchronous Node.js `EventEmitter` for external lifecycle hooks (`auth:*`, `inbound:*`), while simultaneously leveraging the new asynchronous, middleware-capable `ReducerEventBus` for internal observability (`log:*`, `engine:*`). 

This duality limits developer capabilities, hurts performance via synchronous blocking, and couples the framework's internal execution loops tightly to external transport integrations (e.g., hardcoded backpressure).

This RFC proposes deprecating the legacy `EventEmitter` entirely, shifting 100% of the framework’s telemetry, lifecycle control, and transport bridging onto the `ReducerEventBus`. We will adopt a "Zero Technical Debt" Developer Experience (DX) by exposing the `EventBus` natively.

### 1.1 Architectural Alignment: The Reactor Pattern
The design of the `ReducerEventBus` is a direct implementation of the **Reactor software design pattern**. By utilizing a single-threaded background event loop to demultiplex incoming requests (events) and dispatch them to specific request handlers (subscribers) via a non-blocking ingestion queue, Zupa achieves the high-concurrency and throughput goals outlined in this RFC. 
This alignment ensures that Zupa remains "transport-agnostic" while effectively managing I/O-bound scaling challenges (the C10k problem) natively in JavaScript.

## 2. Goals
- **Single Source of Truth**: Funnel all framework events (Auth, Inbound Messages, Engine Execution, Logs) through the `EventBus`.
- **Zero-Latency Ingestion**: Ensure external hooks never block the high-throughput `AgentRuntime` execution loop.
- **Middleware Parity**: Allow developers to write `Express.js`-style reducers (interceptors) to drop, mutate, or log *any* system event.
- **Transport Agnosticism**: Abstract features like Inbound Concurrency Limiting/Backpressure into generic EventBus Reducers, rather than hardcoded transport bridges.
- **Robust DX**: Provide a typesafe, explicit `agent.bus.subscribe()` and `agent.bus.use()` API, exposing the full `ZupaEvent` metadata (`seq`, `timestamp`).

## 3. Non-Goals
- We are **not** changing the underlying State Graph (Pregel) execution model. This RFC only affects the event telemetry and bridging *around* the graph execution.
- We are **not** rewriting specific Transport Adapters (like `WWebJSTransport`). We are only changing how their events are integrated into the runtime.

## 4. What Changes Now
### A. The End of `AgentRuntime.on()`
The legacy facade `agent.on('auth:request', handler)` will be deprecated and removed. It is a leaky abstraction that hides critical metadata (sequence IDs) and conflates synchronous NodeJS events with our async ingestion queues.

Instead, developers will interact directly with the bus:
```ts
agent.bus.subscribe('transport:auth:request', (event: ZupaEvent<AuthPayload>) => {
    // Access to event.timestamp, event.seq, and event.payload
});
```

### B. Transports Become Pure Event Emitters
Currently, `AgentRuntime` injects an `onInbound` callback into Transports, and uses a hardcoded `bindTransportInbound` bridge to manage concurrency.
Under the unified system:
- Transports simply emit `{ channel: 'transport', name: 'inbound', payload: msg }` to the Bus.
- Concurrency logic becomes a standard Reducer (`EngineLoadBalancer`) that intercepts `transport:inbound` events, dropping them or pausing them if the engine is at capacity.

## 5. What This Opens The Door To
- **Time-Travel Debugging**: Because all inputs (auth, messages) and outputs (node state, logs) are pushed to the same ordered Bus with a monotonic sequence ID (`seq`), Zupa sessions can be dumped to disk and perfectly replayed locally to reproduce production bugs.
- **Event-Driven Firewalls**: Developers can effortlessly write plugins that intercept `transport:inbound` events and return `null` if the sender is blacklisted, dropping the event before the Engine even wakes up.
- **Distributed Orchestration**: The `EventBus` payloads are pure JSON. This makes it trivial to proxy the Bus over Redis or WebSockets, allowing an Agent running in one microservice to trigger hooks in an entirely different stack.

---

## 6. Concrete Implementation Plan

> **Note:** This implementation employs a phased, TDD-first rollout to ensure no regressions.

### Phase 1: Internal Event Alignment & Facade Removal
**Objective**: Map legacy events to standard Bus channels and eliminate the synchronous `EventEmitter`.

1. **Map Event Names**: Standardize the vocabulary.
    - `auth:request` -> `transport:auth:request`
    - `inbound:received` -> `runtime:inbound:received`
    - `inbound:error` -> `runtime:inbound:error`
2. **Refactor `AgentRuntime` internally**:
    - Replace all `this.emitRuntimeEvent()` calls with `this.runtimeResources.bus.emit()`.
3. **Deprecate the Legacy Facade**:
    - Remove `public on(event, handler)` from `AgentRuntime`.
    - Expose `public get bus(): EventBus` returning the underlying `ReducerEventBus`.
    - Update all Examples and Tests to use `agent.bus.subscribe()`.

### Phase 2: Decoupling Transports
**Objective**: Remove `bindTransportInbound/Auth` bridges; teach transports to talk directly to the Bus.

1. **Update `MessagingTransport` Interface**:
    - Remove `onInbound`, `onAuthRequest`, etc. from the interface.
    - Add `injectBus(bus: EventBus): void`.
2. **Refactor Adapters**:
    - Update `WWebJSTransport` (and others) to emit `transport:inbound` directly to their injected bus upon receiving a message.
3. **Engine Subscription**:
    - `AgentRuntime` subscribes to `transport:inbound` to trigger the `runInboundEngine` sequence.

### Phase 3: Middleware-Based Concurrency Limiting
**Objective**: Re-architect Phase 1 Backpressure into a pure EventBus Reducer.

1. **Create `InboundConcurrencyLimiter` Reducer**:
    - Maintains an internal `inFlight` count.
    - Matches `transport:inbound` events.
    - If `inFlight < max`, increments counter and passes event.
    - If `inFlight >= max`, returns `null` (drops it) AND emits a generic `transport:overload_rejected` event.
    - Matches `runtime:inbound:processed` / `failed` to decrement the counter.
2. **Remove `bindTransportInbound`**:
    - Delete the `packages/runtime/src/inbound/transportBridge.ts` module entirely, as it is obsolete.
    - Inject the new Reducer into the Bus during `createAgent` initialization.

### Verification Criteria
- All 47+ runtime core tests pass.
- No `EventEmitter` imports remain in `packages/runtime`.
- Overload tests accurately verify that `inFlight` drops messages purely via Reducer logic.
