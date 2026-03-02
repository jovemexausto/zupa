# ADR 02: Autonomous Resources and Event-Driven Architecture

## Status
Accepted

## Context
As the Zupa framework evolved to support more complex deployments involving reactive UI dashboards, decoupled logging infrastructures, and streaming components, the core `AgentRuntime` became a sprawling orchestrator heavily encumbered with disparate responsibilities. The introduction of the `EventBus` provided a generalized solution for inter-component communication, but components like the REST API (`@zupa/api` middleware), Server-Sent Events (SSE) broadcasters, and `ReactiveUiProvider` implementations were initially built with a tight callback-based architecture attached directly to the runtime instance.

This pattern manifested severe technical debt: 
1. `AgentRuntime.ts` contained explicit glue code wiring up disparate UI servers and callback handlers, violating separation of concerns.
2. The `ReactiveUiProvider` necessitated manual interception of events (`onClientConnect`, `onClientEvent`), which could not compose elegantly with internal runtime flows.
3. Our public SDK (`createAgent.ts`) had to be manually manipulated to funnel internal events into user-facing callbacks, leading to `PinoLogger` manual setups and fragile lifecycle management.

To transform Zupa into a robust Event Machine, we needed to elevate the `EventBus` from an internal messaging mechanism to the primary backbone of the entire architecture, establishing an architecture of loosely coupled "Autonomous Resources".

## Decision
We have decided to fundamentally pivot towards an "Autonomous Resource" model powered natively by the `EventBus`.

### 1. The Autonomous Resource Pattern
All auxiliary components surrounding the `AgentRuntime`—including the REST API layer, dashboards, UI servers, and logging sinks—must act as autonomous Event Citizens. They implement the `RuntimeResource` interface, receive a `RuntimeResourceContext` (which provides direct access to the `EventBus`), and manage their own state explicitly by subscribing to and emitting events on this common bus. They no longer rely on manually orchestrated callbacks provided by the `AgentRuntime`.

### 2. Refactoring `@zupa/api` and `RuntimeUiServer`
- The legacy `RuntimeUiServer` within `@zupa/runtime` has been entirely expunged. The orchestration of HTTP servers and express apps no longer resides inside the backend logic.
- The `@zupa/api` module has been transformed into a fully-fledged `ZupaApiResource`. Instead of demanding complex callbacks from developers (`getAgentId()`, `isOnline()`, `getLatestAuthQr()`), the API node naturally derives its internal state by subscribing in the background to events emitted under the `transport:auth:*` and `agent:stream:*` channels.
- `SseDashboardBroadcaster` is now an autonomous class that pipes events directly from the EventBus to connected HTTP clients.

### 3. Unified Developer SDK Facade
To protect developers from the underlying complexity of the `EventBus` while offering maximum flexibility, the `createAgent()` SDK exports safe abstractions (`agent.on()`, `agent.use()`).
- `agent.on('auth:request', ...)` seamlessly bridges the legacy interface by internally proxying EventBus `transport:auth:request` topics.
- Users can define external, global state reducers using `agent.use(reducer)` mapped directly to `bus.use(reducer)`.

### 4. Pluggable Logging
Logging was removed from manual orchestration and extracted into an autonomous `EventLoggerResource` (acting as a sink) inside the `@zupa/adapters` package, which pipes standard `log:*` EventBus signals directly into Pino instances.

## Consequences

### Positive
- **Architectural Purity & Decoupling:** The Agent core is now pristine and singularly focused on orchestrating intelligent routing, tool execution, and inference. It knows nothing about REST HTTP routing or dashboard UI patterns.
- **Robust Observability:** Since components communicate asynchronously via the EventBus, users can trivially observe everything happening inside the orchestrator by tapping into the channels natively.
- **Improved Type Safety:** `agent.on()` now enforces rigorous type signatures associated to internal transport payloads.
- **Zero-Latency Event Piping:** The ReducerEventBus effectively allows local event ingestion with zero latency, paving the way for multi-tenant high-throughput configurations.

### Negative
- **Asynchronous Debugging:** Logic tracking is marginally harder tracing through an Event Bus vs synchronous callbacks.
- **Configuration Complexity:** Building new custom providers requires understanding EventBus primitives rather than simple interface implementations.
