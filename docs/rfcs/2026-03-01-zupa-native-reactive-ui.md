# RFC: Zupa Native Reactive UI & Modular API Surfaces

## 1. Product Vision

Zupa's vision is to be the premier durable framework for orchestrating AI interactions across any medium, reshaping the boundaries and responsibilities between the backend, dashboards, and custom frontends.

Every Zupa agent ships with a built-in backend exposing three distinct, concurrent API surfaces. And because Zupa is a self-contained Node.js process with zero managed-service dependencies, every one of these surfaces ships inside a single deployable unit — **your agent deploys anywhere**: a $5 VPS, a Docker container, a Raspberry Pi, or a serverless edge function.

### A. REST API (Production Infrastructure)
- **Purpose:** Headless infrastructure for auth, health checks, webhook ingestion, and remote observability.
- **Current Anchor:** `packages/runtime/src/ui/server.ts` handles generic HTTP routing (e.g., `GET /auth/qr?format=raw`).
- **Design Principle:** Stateless request/response. Standard Express middleware mounted by the runtime. No real-time concerns.

### B. Dashboard (SSE / Built-in UX)
- **Purpose:** The framework's built-in developer/admin experience (DX/UX). Enables scanning QR codes (or other auth flows), viewing real-time system logs, and monitoring scheduled flows.
- **Why SSE?** `EventSource` is structurally perfect for unidirectional, high-throughput log streaming from the runtime to a dashboard without requiring complex socket lifecycle management. It's trivially consumable from any browser and survives proxy environments that may reject WebSocket upgrades.
- **Current Anchor:** The `GET /agent/events` route in `RuntimeUiServer`.
- **Design Principle:** Fire-and-forget broadcast. The runtime emits; whoever is listening receives. No session binding, no bidirectional negotiation.

### C. Zupa Native Reactive UI (WebSockets / AG-UI)
- **Purpose:** A bi-directional, CopilotKit/AG-UI style socket API paired with custom frontends (e.g., a React client via `@zupa/react`) for high-fidelity interactive chat development, generative UI, and real-time graph state synchronization.
- **Why WebSockets?** Enables low-latency state synchronization, generative UI forms (where client inputs immediately alter backend state), stream cancellation (`ABORT_STREAM`), and connection presence awareness.
- **Design Principle:** Session-bound, targeted, bi-directional channel with explicit connection lifecycle. Each connected client is a participant in the agent's execution.

> **Key Insight:** These three surfaces have fundamentally different concerns, lifecycles, and consumer expectations. They should NOT be conflated into a single interface or adapter.

---

## 2. Token Streaming vs. Voice Pipelines (The Tradeoff Boundary)

A pivotal constraint in establishing this reactive UI is resolving the conflict between Token Streaming and Voice pipelines.

### The Problem
In `packages/core/src/utils/chat.ts`, the `finalizeResponse` function utilizes the `TTSProvider` if `input.preferredVoiceReply` is enabled. Standard Text-to-Speech engines (like OpenAI `tts-1`) cannot synthesize sub-word token streams — they require complete sentences or full blocks of text to generate proper inflection and pacing.

### The Boundary
**Token streaming is strictly an optimization for visual text interfaces.** If an orchestrator detects a voice target, it MUST buffer the `LLMProvider`'s token stream until completion (or sentence terminus) before executing the TTS pipeline. The Reactive UI will not receive real-time voice streaming chunks down the socket — only text tokens and state deltas.

> **Future Path:** Some providers (ElevenLabs, Azure Neural TTS) support streaming audio from *sentence-level* chunks. This opens a middle ground: the orchestrator could buffer tokens until a sentence boundary (`.`, `?`, `!`), flush that sentence to TTS, and stream the resulting audio chunk. This is not an immediate goal but should be acknowledged as a natural evolution of the architecture.

### The Solution: Composable Finalization Strategies
The Voice and Streaming pipelines share ~90% of the same graph nodes (`access_policy`, `event_dedup_gate`, `context_assembly`, `prompt_build`, `persistence_hooks`, `telemetry_emit`). The only node that fundamentally diverges is `response_finalize` (and partially `llm_node`).

Rather than shipping two entirely separate graphs (duplicating 10+ shared nodes), Zupa should offer **one composable graph with swappable finalization strategies:**

```typescript
// Conceptual API
const graph = buildDefaultGraph({
  finalizationStrategy: 'streaming' | 'buffered'
});
```

- **`'buffered'` (Voice/Standard):** Waits for full LLM completion, optionally runs TTS, dispatches via `transport.sendText()` or `transport.sendAudio()`.
- **`'streaming'` (Reactive UI):** Yields sub-word tokens instantly via WebSocket, emits `STATE_DELTA` events on graph transitions, supports `ABORT_STREAM` from client.

This approach solidifies Zupa's identity as a framework for custom graph execution: we provide robust primitives and well-crafted "batteries-included" defaults, but developers can choose the exact strategy that fits their medium — or entirely compose their own graph.

---

## 3. Public Agent State (Typed, Observable, Reactive)

### The Problem with `RuntimeState`
The current `RuntimeState` (`packages/runtime/src/nodes/index.ts`) is the **internal graph execution state**. It contains implementation details like `assembledContext` (full message history + vector search results), `builtPrompt`, `inboundDuplicate`, etc. This is NOT what should be streamed to a React frontend — it's too noisy, potentially huge (hundreds of KB per diff), and exposes internal orchestration mechanics.

What CopilotKit and LangGraph expose to the frontend is the **developer-defined state** — a typed schema that represents the agent's *public*, meaningful data that the UI cares about.

### Current Anchor: The `kv` Scratchpad
Today, Zupa has a `kv` field on `RuntimeState` (`packages/core/src/entities/session.ts`), backed by `GraphKVStore`. It's a `Record<string, JsonValue>` scratchpad — fully checkpointed, JSON-validated, and durable. But it's untyped (just `string` keys) and treated as an afterthought rather than a first-class reactive surface.

### The Evolution: Generic Public Agent State
We reframe `kv` as the **Public Agent State** — a generic, type-safe interface that developers define per-agent:

```typescript
// Developer defines their agent's public state schema
interface MyAgentState {
  bookingDate: string | null;
  selectedPlan: 'basic' | 'pro' | null;
  formStep: number;
  // Extensible: still allows arbitrary KV for ad-hoc usage
  [key: string]: JsonValue;
}

// The runtime graph becomes generic over this state
type MyRuntimeState = RuntimeState<MyAgentState>;
```

The core type evolves from:
```typescript
// Before: untyped scratchpad
kv?: KVStore | undefined;

// After: generic public state with KV fallback
export interface RuntimeState<TAgentState extends Record<string, JsonValue> = KVStore> {
  // ... internal fields (assembledContext, builtPrompt, etc.)
  agentState: TAgentState;  // The developer-owned, observable state
}
```

### Scoped State Subscriptions
When the Reactive UI streams `STATE_DELTA` events, it should NOT diff the entire `RuntimeState`. Instead, it diffs **only `agentState`** — the developer-defined public surface. Furthermore, the client should be able to declare which keys it observes:

```typescript
// React client subscribes to specific keys
const { bookingDate, formStep } = useAgentState<MyAgentState>(['bookingDate', 'formStep']);
```

This prevents saturating the socket with noise from irrelevant internal state transitions.

---

## 4. Port Separation

### Current Problem
The previous iteration of this RFC bundled dashboard SSE logging AND WebSocket reactive state into a single `UiChannelProvider` port. These are fundamentally different concerns with different lifecycles:

| Concern | Pattern | Lifecycle | Targeting |
|---------|---------|-----------|-----------|
| Dashboard | Fire-and-forget broadcast | No session binding | All listeners |
| Reactive UI | Session-bound bidirectional | Explicit connect/disconnect | Specific `clientId` |

### Proposed Separation

**Dashboard Port** — simple, unidirectional, always available:
```typescript
// packages/core/src/ports/dashboard.ts
export interface DashboardProvider extends RuntimeResource {
  emitLog(level: string, payload: unknown): void;
}
```

**Reactive UI Port** — session-aware, bidirectional, only active when the UI channel is the primary interaction medium:
```typescript
// packages/core/src/ports/reactive-ui.ts
export interface ReactiveUiProvider extends RuntimeResource {
  emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void;
  emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void;
  onClientEvent(handler: (clientId: string, type: string, payload: unknown) => void): () => void;
  onClientConnect(handler: (clientId: string) => void): () => void;
  onClientDisconnect(handler: (clientId: string) => void): () => void;
}
```

The REST API does not need a port at all — it's just Express middleware mounted directly by the runtime.

---

## 5. Channel-Aware Inbound Routing

Currently, `InboundMessage` (`packages/core/src/ports/transport.ts`) assumes a generic origin. We expand it so the runtime knows whether it's talking to a WebSocket client or a standardized transport:

```typescript
export interface InboundMessage {
  messageId: string;
  from: string;
  body: string;
  source: 'transport' | 'ui_channel';
  clientId?: string; // If source=ui_channel, targeting the specific WS connection
}
```

### Dashboard Observability During Transport Sessions
When a transport (like WhatsApp) is the active interaction channel, the Dashboard SSE remains fully operational for system-level logs (`LOG`, `NODE_TRANSITION`, `SCHEDULE_FIRED`). However, the dashboard should also support **read-only observation** of the `agentState` for active transport sessions — not for bidirectional interaction, but for debugging and monitoring. The `DashboardProvider` can optionally include state snapshots in its log stream without conflating this with the Reactive UI's interactive state sync.

---

## 6. Package Topology

Since Zupa is a monorepo, each API surface and its consumer SDK maps cleanly to a dedicated package with clear dependency boundaries:

```
packages/
├── core/              # (existing) Ports, entities, shared types
│   ├── ports/
│   │   ├── dashboard.ts       # DashboardProvider interface
│   │   ├── reactive-ui.ts     # ReactiveUiProvider interface
│   │   └── transport.ts       # MessagingTransport, InboundMessage
│   └── entities/
│       └── session.ts         # AgentState<T> generic, KVStore, JsonValue
│
├── engine/            # (existing) Pregel executor, graph primitives
├── runtime/           # (existing) AgentRuntime, node handlers, graph wiring
│
├── adapters/          # (existing) LLM, transport, storage adapters
│
├── api/               # [NEW] REST API surface
│   └── Express middleware: health, auth, webhooks, observability endpoints
│   └── Depends on: core
│
├── dashboard/         # [NEW] Built-in Dashboard (SSE + frontend)
│   └── SSE broadcaster (DashboardProvider adapter)
│   └── React dashboard app (QR scanning, logs, schedules)
│   └── Depends on: core, api
│
├── reactive-ui/       # [NEW] WebSocket server (ReactiveUiProvider adapter)
│   └── WS server using `ws` package
│   └── AG-UI event protocol, STATE_DELTA diffing, ABORT_STREAM handling
│   └── Depends on: core
│
├── react/             # [NEW] Client-side React SDK (@zupa/react)
│   └── useAgentState<T>() hook with scoped subscriptions
│   └── useAgentChat() hook for messaging
│   └── WebSocket connection manager
│   └── Depends on: core (types only, no server code)
│
├── testing/           # (existing) Test utilities
└── zupa/              # (existing) Top-level convenience package
```

### Dependency Flow
```
@zupa/react (client)  ──types──▶  @zupa/core
                                      ▲
@zupa/api             ────────────────┘
@zupa/dashboard       ──────────────────┘
@zupa/reactive-ui     ────────────────────┘
                                      ▲
@zupa/runtime         ─── wires ──────┘
```

### Key Design Decisions
- **Deploy-anywhere preservation.** No new package introduces a mandatory external service. The dashboard runs on the same Node.js process. The WebSocket server boots alongside the agent. SQLite remains the default persistence. A Zupa agent with all three API surfaces active is still a single `node index.js` away from production.
- **`@zupa/react` depends ONLY on `@zupa/core` types.** It never imports server code. This keeps the client bundle minimal and allows independent versioning.
- **`@zupa/dashboard` is a full-stack package** — it bundles both the SSE adapter (server) and the React dashboard app (client). This is the "batteries-included" DX experience that every agent gets out of the box.
- **`@zupa/api` is pure Express middleware.** It can be mounted by `@zupa/runtime` automatically or used standalone by developers who want a headless deployment.
- **`@zupa/reactive-ui` is the server-side WebSocket adapter.** It implements `ReactiveUiProvider` from `@zupa/core`. Paired with `@zupa/react` on the client side, it forms the full AG-UI stack.

---

## 7. Archive Context
> **Note:** This RFC defines the clear boundaries, usage paths, and long-term trajectory of Zupa's interactive surface area. It unifies and archives all prior exploratory drafts (`token-streaming.md`, `ui-channel-resource.md`, `ui-channel-websockets.md`, `ui-transport-dualism.md`). **No immediate implementation is required; this serves as the benchmark for future roadmap execution.**
