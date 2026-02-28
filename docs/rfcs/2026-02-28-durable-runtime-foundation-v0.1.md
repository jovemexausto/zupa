# RFC: Durable Runtime Foundation for Long-Running Orchestration (v0.1)

- **Date:** 2026-02-28
- **Status:** Research Draft (Spec-Only)
- **Target:** Zupa v1.x kernel + orchestration foundation track
- **Normative source for:** durability, checkpointing, wait/resume, and outbox semantics
- **Related umbrella RFC:** `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`
- **Related lifecycle RFC:** `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`
- **Related scheduling RFC:** `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`
- **External references (non-normative):**
  - https://useworkflow.dev/docs/how-it-works
  - https://docs.useworkflow.dev/llms-full.txt
  - https://github.com/WorkflowDev/useworkflow

## 1. Problem Statement

Zupa now has design-approved RFCs for:
- multi-flow generators,
- HITL interrupts (including proxy mode),
- policy lifecycle hooks,
- scheduled flows with campaign fan-out.

These features require long-lived, resumable execution semantics. Current runtime is deterministic per turn, but it is not yet a complete durable orchestration substrate for pause/resume across restarts, timeout-driven resumes, and exactly-once outbound side effects.

Without a durability foundation, feature implementations risk:
- duplicate side effects under retries/restarts,
- non-replayable flow/HITL transitions,
- fragile timeout and resume behavior,
- scheduler and HITL race-condition drift.

This RFC defines the base architecture that must exist before implementing higher-level features.

## 2. Current Baseline and Readiness Assessment

### 2.1 Strengths in current codebase

1. Deterministic phase pipeline is established (`access_policy` -> `telemetry_emit`).
2. Inbound dedup baseline exists via `claimInboundEvent(...)`.
3. Runtime has bounded ingress concurrency and overload shedding.
4. LLM/STT/TTS/tool operations already have timeout + bounded retry primitives.
5. Phase contracts (`requires/provides`) enforce internal state invariants.

Code grounding:
- `packages/zupa/src/core/kernel/context.ts`
- `packages/zupa/src/core/kernel/phases/sessionAttach.ts`
- `packages/zupa/src/core/runtime/inbound/transportBridge.ts`
- `packages/zupa/src/core/utils/timeout.ts`
- `packages/zupa/src/core/utils/retry.ts`
- `packages/zupa/src/core/kernel/phase.ts`

### 2.2 Gaps against RFC feature set

1. Outbound send occurs before durable persistence completion (send-first model).
2. No flow checkpoint store or resumable frame model exists yet.
3. No wait registry for HITL/scheduler/proxy timeout resumption.
4. No durable outbox/inbox ledger for exactly-once effect progression.
5. No scheduler execution store in runtime contracts.
6. Local default integrations still use fake in-memory database.

Code grounding:
- `packages/zupa/src/core/kernel/phases/responseFinalize.ts`
- `packages/zupa/src/capabilities/chat/finalizeResponse.ts`
- `packages/zupa/src/core/kernel/phases/persistenceHooks.ts`
- `packages/zupa/src/integrations/index.ts`

## 3. Goals and Non-Goals

### Goals

1. Define durability contracts required by multiflow/HITL/scheduled features.
2. Preserve existing deterministic kernel mental model.
3. Guarantee replayable and auditable state transitions.
4. Guarantee bounded, deterministic timeout and retry behavior.
5. Maintain compatibility for agents not using new features.

### Non-Goals

1. No runtime implementation in this RFC cycle.
2. No immediate replacement of existing kernel phase architecture.
3. No generic middleware/plugin chain as primary extension mechanism.
4. No mandatory external workflow engine dependency for all users.

## 4. Architectural Decision (Locked)

### 4.1 Core direction

Zupa keeps its deterministic turn kernel and adds a durable orchestration substrate under it.

### 4.2 Integration strategy

A hybrid approach is locked:
1. Native Zupa durability contracts are canonical.
2. Optional adapter may map those contracts to an external workflow engine.
3. Full runtime replacement with external engine is out of scope for v0.1.

### 4.3 Middleware decision

Zupa does **not** adopt a generic `agent.use(...)` middleware pipeline as the core architecture.  
Instead, durability is exposed through explicit capability ports and policy hooks.

## 5. Durable Runtime Model

### 5.1 Turn envelope

Each inbound/synthetic trigger is processed as a durable turn:
- claim input identity,
- load snapshot/checkpoint,
- execute deterministic kernel branch,
- commit state transition and outbound intents atomically,
- dispatch outbound intents via outbox worker.

### 5.2 Checkpoint model

Checkpoint snapshot MUST include (minimum):
- active flow identity,
- flow frame/program counter,
- pending ask/wait descriptors,
- HITL mode and escalation/proxy correlation ids,
- last processed inbound/event identity.

### 5.3 Wait/interrupt model

All long waits MUST be represented as durable wait records:
- wait type (`confirm`, `admin_resolution`, `proxy_input`, `timeout`, `scheduler`),
- correlation keys (`sessionId`, `flowId`, `escalationId`, `proxyId`, `scheduleId`),
- deadline/timeout policy,
- resume payload schema/version.

### 5.4 Outbox model

Outbound communication MUST be produced as durable intents, not direct side effects in core turn transaction:
- intent persisted first,
- dispatcher sends,
- delivery status persisted.

## 6. Proposed Foundation Contracts (Experimental)

### 6.1 DurableStore

```ts
type DurableStore = {
  claimInbound(inputKey: string): Promise<'claimed' | 'duplicate'>;
  loadSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null>;
  beginTurn(txInput: TurnTxInput): Promise<TurnTransaction>;
};

type TurnTransaction = {
  appendEvent(event: DurableEvent): Promise<void>;
  upsertCheckpoint(checkpoint: FlowCheckpoint): Promise<void>;
  upsertWait(wait: WaitRecord): Promise<void>;
  enqueueOutbox(intent: OutboxIntent): Promise<void>;
  complete(result: TurnResult): Promise<void>;
  fail(error: DurableFailure): Promise<void>;
};
```

### 6.2 WaitRegistry

```ts
type WaitRegistry = {
  register(wait: WaitRecord): Promise<void>;
  resolve(waitId: string, payload: unknown): Promise<void>;
  timeoutDue(now: Date, limit: number): Promise<WaitRecord[]>;
};
```

### 6.3 OutboxDispatcher

```ts
type OutboxDispatcher = {
  claim(limit: number): Promise<OutboxIntent[]>;
  markSent(intentId: string, metadata?: Record<string, unknown>): Promise<void>;
  markFailed(intentId: string, reason: string, retryAt?: Date): Promise<void>;
};
```

### 6.4 Scheduler foundation linkage

Scheduler contracts from the scheduling RFC remain authoritative; this RFC adds the requirement that schedule claims/runs share the same durability guarantees and correlation model as inbound turns.

## 7. Normative Execution Order

For durable turns, runtime MUST follow:
1. input dedup claim (`inbound.id` / synthetic id).
2. command gate.
3. pre-inference policy (`beforeLLM`) if configured.
4. flow resume/router/classic selection.
5. response candidate + pre-send policy (`beforeResponse`).
6. durable commit of state transition + outbox intents.
7. outbox dispatch send/cancel path.
8. persistence finalization.
9. post-send side effects (`onResponse`).

Important:
- `onResponse` remains post-send/post-persist side-effect hook.
- `reply` remains required-by-default in structured mode.
- hook failure fallback remains deterministic (`continue` + telemetry).

## 8. Reliability and Exactly-Once Guarantees

1. Duplicate inbound keys MUST not advance checkpoints or emit duplicate outbox intents.
2. Outbox intents MUST have idempotency keys and claim semantics.
3. Recovery after crash MUST resume from last committed checkpoint/wait/outbox state.
4. Timeout resumes MUST be deterministic and auditable.
5. Campaign fan-out dedup identity MUST include recipient dimension.

## 9. Security and Audit Requirements

1. Privileged HITL actions MUST pass resolver checks (`resolveActor` + `can`).
2. Admin proxy inputs MUST be authorized before becoming resumable flow input.
3. All resolver denials and privileged actions MUST emit auditable events.
4. Scheduler tool scope enforcement MUST remain server-side and not trust model arguments.

## 10. Middleware and Plugin Positioning

### 10.1 Not required now

A generic middleware chain is not a prerequisite for these RFC features.

### 10.2 What is required now

Capability-specific extension ports:
- durability store,
- wait registry,
- outbox dispatcher,
- scheduler store/executor,
- admin auth resolver,
- response policy hooks.

### 10.3 Future plugin path

A plugin framework MAY be introduced later for packaging cross-cutting policies, but only after durability state contracts are stable.

## 11. External Workflow Engine Assessment (`useworkflow.dev`)

### 11.1 Potential gains

Based on public docs/repo material, workflow engines provide:
- execution context + persistent snapshots,
- wait/until primitives with timeout and resume,
- queue-backed durable execution,
- lifecycle hooks and tracing.

These map well to Zupa needs for flow/HITL/scheduler orchestration.

### 11.2 Risks

1. Semantic mismatch with Zupa kernel phase contracts.
2. Operational lock-in if external model becomes canonical too early.
3. Harder migration/control if auth/transport semantics are coupled into engine-specific APIs.

### 11.3 Locked integration posture

Hybrid adapter path is the baseline:
- define Zupa-native durability contracts first,
- optionally implement an adapter over external workflow engines,
- keep feature semantics independent of any single engine.

## 12. Rollout Plan

### Phase A — Foundation Contracts

MUST deliver:
- durable store interfaces and canonical state shapes,
- wait registry/outbox contracts,
- correlation and event taxonomy,
- compatibility policy for non-flow agents.

### Phase B — Runtime Wiring

MUST deliver:
- transactional checkpoint + outbox commit path,
- dispatcher workers and timeout processors,
- flow/HITL/scheduler branch integration onto foundation.

### Phase C — Hardening

MUST deliver:
- replay tooling and audit completeness checks,
- external engine adapter (optional),
- SLO metrics and operational runbooks.

## 13. Validation Matrix

### 13.1 Compatibility
- agents without flows/HITL/schedules behave unchanged.
- existing two-arg `onResponse` remains valid.

### 13.2 Durability correctness
- crash between commit and send does not lose or duplicate outbox intent.
- restart resumes from last committed checkpoint/wait state.

### 13.3 Reliability
- duplicate inbound ids do not double-advance flow/wait/proxy states.
- timeout resume paths are deterministic under same snapshot.

### 13.4 Security
- unauthorized resolver actions are denied and auditable.
- scheduler tool cannot escape current-session user scope.

### 13.5 Observability
- every state transition carries correlation ids:
  `requestId`, `sessionId`, `flowId?`, `escalationId?`, `proxyId?`, `scheduleId?`.
- lifecycle/policy/hitl/scheduler events remain cross-RFC consistent.

## 14. Open Questions (v0.2+)

1. Should outbox become mandatory for all outbound channels in first implementation wave?
2. Should wait processing be in-kernel or split into dedicated worker service by default?
3. What minimum adapter contract is needed to support `useworkflow` without leaking engine-specific abstractions into app code?
4. Should campaign fan-out batching and throttling be part of foundation or scheduler phase hardening?

## Sync Contract (Cross-RFC Alignment)

This RFC, `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`,
`docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`, and
`docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md` MUST remain aligned on:
1. command-first ordering.
2. flow-only router decision scope.
3. policy hooks apply to classic + flow + scheduled outputs.
4. `reply` required-by-default posture.
5. `onResponse` as post-send/post-persist side-effect hook.
6. scheduler control-plane vs agent tool-plane split.
7. HITL/proxy/schedule transitions are durable, replayable, and auditable.
