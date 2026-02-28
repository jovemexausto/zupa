# RFC: Zupa Production Readiness & Baseline Solidification

## Background & Objective
The Zupa framework currently has a solid functional runtime pipeline (graph-based edge transitions, decoupled providers, robust state management via `RuntimeState.kv`). However, to safely run in a production environment with high reliability, we must address critical operational gaps. 

This RFC proposes a comprehensive plan to resolve technical debt, solidify the baseline, and implement a robust production-grade architecture that guarantees message idempotency, prevents resource exhaustion (backpressure), and ensures predictable failure recovery.

## Proposed Architecture & Features

### 1. Inbound Reliability: Idempotency & Deduplication
Currently, inbound messages lack explicit uniqueness constraints, which could lead to dual-processing of the same payload upon platform redelivery (e.g., from WhatsApp).
- **InboundMessage Entity Update**: Add `messageId` (or `idempotencyKey`) to `InboundMessage`.
- **Deduplication Ledger**: Introduce a `ProcessedEvents` table/store in the [DatabaseProvider](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/ports/database.ts#8-26).
- **Pipeline Gate**: Add an `event_dedup_gate` node at the very beginning of the runtime graph. If `dedupeKey` exists, return a short-circuit response.
- **Side-Effects**: State checkpoints and message dispatch should only occur after succeeding the dedupe strict fence.

### 2. Execution Reliability: Unified Retries & Timeouts
External providers (LLM, STT, TTS, APIs) fail unpredictably. The current implementation relies on ad-hoc fallbacks.
- **Global `withTimeout` Wrapper**: Enforce strict TTLs on every tool execution and provider call. No node or tool should block indefinitely. Configurable via [RuntimeConfig](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/config/types.ts#7-45) (e.g., `toolTimeoutMs`, `llmTimeoutMs`).
- **Unified Retry Policy**: Implement a universal retry wrapper (`withRetry`) utilizing exponential backoff + jitter. 
- **Error Taxonomy**: Classify errors into `Transient` (network blips, 429s) vs `Terminal` (auth failure, bad schema). Only retry `Transient` errors.
- **Circuit Breaking**: Add a simple circuit breaker per provider to fail fast during prolonged outages.

### 3. Resource Protection: Backpressure
Under heavy load, processing every inbound message concurrently can exhaust API rate limits, memory, or DB connections.
- **Inbound Queue / Concurrency Limiter**: Introduce an async queue with a max concurrency limit per engine instance (or per tenant/user). 
- **Overload Handling**: If the queue is saturated, return an equivalent `429 Too Many Requests` or emit a fallback "I'm currently overloaded" response to the user.

### 4. State Reliability: Zombie Session Housekeeping
Sessions currently stay alive until manually closed, which leaks state/context over time if the user goes silent.
- **Idle Timeout Enforcer**: Inject logic in `session_attach` to check `Date.now() - session.lastActiveAt > RuntimeConfig.sessionIdleTimeoutMinutes`. If expired, cleanly finalize the session (summary generation) before starting a new one.
- **Background Housekeeping Job**: For fully abandoned sessions, implement a periodic sweeper that emits an [EndSession](file:///Users/jovemexausto/Workspace/zupa/packages/runtime/src/session/lifecycle.ts#3-8) ledger event to garbage-collect stale sessions.

### 5. Visibility, Observability, and Auditability
While there is telemetry per-phase, operational correlation is missing.
- **Trace Context**: Ensure every emitted log, telemetry event, and database record shares a correlatable `requestId`, `sessionId`, `userId`, and `eventId`.
- **Audit Logging**: Persist immutable records of "Who did what and why" (human interventions, tool execution verdicts) to an audit ledger.
- **Replay & Diagnostics**: Provide a path to replay raw payloads (`dry-run` vs `commit`) to debug regressions, utilizing the checkpointed graphs.

## Execution Plan & Phases

To ensure progressive delivery without destabilizing the current baseline, implementation will be phased:

### Phase 1: Core Protection (Immediate Priority)
1. Add `messageId` to `InboundMessage` mapping.
2. Implement `event_dedup_gate` node and SQLite `ProcessedEvents` implementation.
3. Wrap all provider calls ([LLMProvider](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/ports/llm.ts#24-27), [STTProvider](file:///Users/jovemexausto/Workspace/zupa/packages/adapters/src/openai/stt.ts#12-46), [TTSProvider](file:///Users/jovemexausto/Workspace/zupa/packages/adapters/src/openai/tts.ts#14-57)) and tools with the `withTimeout` utility.
4. Add basic inbound concurrency limits.

### Phase 2: Resilience (Next Priority)
1. Build the unified `RetryPolicy` (backoff + jitter).
2. Apply retries to LLM/Database/Transport calls based on Error Taxonomy.
3. Implement `sessionIdleTimeoutMinutes` in `session_attach`.

### Phase 3: Observability & Control (Follow-up)
1. Plumb correlation IDs through the full [RuntimeEngineContext](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/contracts/engine.ts#39-50).
2. Flesh out detailed SLO/telemetry dashboards.
3. Build the Audit Ledger mechanics.

## Actions Required
- Review and approve this RFC.
- Delete the stale [CODEBASE_STATUS_ASSESSMENT.md](file:///Users/jovemexausto/Workspace/zupa/CODEBASE_STATUS_ASSESSMENT.md) (superseded by this action plan).
- Add the Phase 1 tasks to our master [TODO.md](file:///Users/jovemexausto/Workspace/zupa/TODO.md) checklist.
