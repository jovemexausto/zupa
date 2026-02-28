# RFC: Response Lifecycle Policy Hooks (v0.1)

- **Date:** 2026-02-28
- **Status:** Research Draft (Spec-Only)
- **Target:** Zupa v1.x kernel + flows experimental track
- **Normative source for:** response lifecycle control semantics
- **Related umbrella RFC:** `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`
- **Related scheduling RFC:** `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`
- **Related durability RFC:** `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`

## 1. Problem Statement

Today, Zupa sends outbound content from `response_finalize` and only runs `onResponse` later in `persistence_hooks`. This means `onResponse` is currently side-effect-only and cannot control delivery.

Current behavior creates two practical limitations:
1. No official way to short-circuit LLM generation for specific turns.
2. No official pre-send policy gate to cancel/replace outbound responses.

For multiflow + HITL scenarios, this creates friction because policy decisions (safety, suppression during takeover, routing, compliance controls) must be expressible before transport side effects occur.

## 2. Current Behavior Baseline (Code-Grounded)

Observed in current runtime:
- command gate executes early.
- classic path builds `replyDraft` in `agentic_loop`.
- transport send occurs in `response_finalize` via `finalizeResponse`.
- persistence and `onResponse` happen in `persistence_hooks` after send.

Additional baseline constraints:
- structured output currently expects `reply` by default (`T extends { reply: string }`).
- no general middleware API exists in current runtime.

## 3. Goals and Non-Goals

### Goals
- Introduce deterministic policy hooks at two lifecycle stages:
  - pre-inference (`beforeLLM`)
  - pre-send (`beforeResponse`)
- Preserve compatibility with existing event-driven users.
- Keep hooks applicable to both classic and flow-generated outputs.
- Improve observability via explicit response lifecycle events.

### Non-Goals
- No runtime code implementation in this RFC.
- No replacement of flow/HITL interrupts with hook-level coroutines.
- No immediate persist-before-send outbox rewrite in phase 1.

## 4. Proposed Hook Model

### 4.1 `beforeLLM` (Pre-Inference)

Purpose: decide whether inference should proceed.

```ts
type BeforeLLMDecision =
  | { action: 'continue' }
  | { action: 'skip_llm'; draftReply?: string; structured?: Record<string, unknown>; reason?: string }
  | { action: 'route_flow'; flowId: string; input?: unknown; reason?: string }
  | { action: 'end'; reason?: string };

beforeLLM?: (input: BeforeLLMInput, ctx: AgentContext) => Promise<BeforeLLMDecision | void>
```

### 4.2 `beforeResponse` (Pre-Send)

Purpose: mutate/cancel/replace response candidate before transport dispatch.

```ts
type BeforeResponseDecision =
  | { action: 'continue' }
  | { action: 'cancel'; reason?: string }
  | {
      action: 'replace';
      reply: string;
      modality?: 'text' | 'voice';
      structured?: Record<string, unknown>;
      reason?: string;
    };

beforeResponse?: (input: BeforeResponseInput, ctx: AgentContext) => Promise<BeforeResponseDecision | void>
```

### 4.3 `onResponse` (Post-Send/Post-Persist)

`onResponse` remains side-effect-oriented and backward compatible, with optional additive metadata:

```ts
onResponse?: (structured: T, ctx: AgentContext, meta?: ResponseMeta) => Promise<void>
```

Existing two-argument handlers MUST continue to work unchanged.

## 5. Type Contracts

### 5.1 Response Metadata

```ts
type ResponseMeta = {
  source: 'classic' | 'flow' | 'short_circuit' | 'scheduled';
  flowId?: string;
  policy?: {
    beforeLLMAction?: 'continue' | 'skip_llm' | 'route_flow' | 'end';
    beforeResponseAction?: 'continue' | 'cancel' | 'replace';
  };
  hitlState?:
    | 'none'
    | 'pending_confirm'
    | 'live_takeover'
    | 'pending_admin_resolution'
    | 'resolved'
    | 'timed_out';
  escalationId?: string;
};
```

### 5.2 Structured Output Compatibility

Default contract remains unchanged:
- `reply` stays required by default in structured output mode.
- Silence/cancel semantics are expressed through `beforeResponse` decisions, not by removing `reply` typing guarantees.

## 6. Runtime Ordering and State Transitions

Normative order:
1. command gate
2. `beforeLLM`
3. active flow resume OR flow router selection OR classic path
4. response candidate creation
5. `beforeResponse`
6. transport send (or cancel)
7. persistence
8. `onResponse`

Normative constraints:
- `beforeLLM` MUST run after commands.
- `beforeResponse` MUST apply to both classic and flow-generated outputs.
- if `beforeLLM` returns `skip_llm`, inference MUST not be called.
- if `beforeResponse` returns `cancel`, transport send MUST be skipped.

Scheduled-source expectation:
- For `source='scheduled'` turns, the same lifecycle ordering and decision contracts MUST apply.

## 7. Interaction with Flows and HITL

- Flow routing remains flow-only in unified model.
- Hooks are policy gates, not multi-turn conversation engines.
- Multi-turn pauses remain in flow/HITL interrupts (`interrupt.confirm`, `interrupt.escalate`, `interrupt.wait`).
- During live takeover or async escalation states, hooks MAY enforce additional suppression/replacement policies, but they do not replace HITL state machines.
- Scheduler authorization remains owned by the scheduling model; policy hooks MUST NOT widen scheduler tool scope beyond current-session user boundaries.

## 8. Compatibility and Migration

Compatibility guarantees:
1. Agents without new hooks MUST behave as today.
2. Existing `onResponse` handlers continue to run.
3. Existing structured output contracts remain valid.

Migration path:
- adopt `beforeLLM` where short-circuit/routing is needed.
- adopt `beforeResponse` where send suppression/replacement is needed.
- keep side effects in `onResponse` or event listeners.

## 9. Observability and Event Contract

Add lifecycle events:
- `response:prepared`
- `response:sent`
- `response:persisted`
- `response:failed`

Event payload SHOULD include:
- `requestId`, `sessionId`, `source`, `flowId?`,
- policy decisions (`beforeLLMAction`, `beforeResponseAction`),
- failure stage and reason when applicable,
- HITL metadata when available.

For scheduled source, payload SHOULD additionally include:
- `scheduleId`, `triggerType`, `scheduledFor`, `runAttempt`.
- for campaign/segment fan-out: `campaignId?`, `segmentId?`, `recipientUserExternalId?`.

## 10. Error Handling and Fallback Policy

Default fallback policy for hook errors:
- hook failure SHOULD default to `continue` behavior,
- runtime MUST emit `response:failed` with stage info,
- runtime MUST avoid duplicate side effects under inbound dedup constraints.

Safety requirements:
- hook exceptions must not crash process-level runtime,
- cancellation/replacement decisions must be deterministic for a given input.

## 11. Future Phase: Persist-Before-Send Outbox (Deferred)

This RFC documents outbox as next-step architecture, not phase-1 requirement.

Target future order (phase 2):
1. candidate + policy
2. persist outbound intent (outbox)
3. dispatch send
4. persist delivery state
5. finalize side effects

Reason for deferral:
- larger persistence and retry contract changes,
- should be scoped as dedicated implementation phase after phase-1 hooks/events.

## 12. Validation Matrix

### 12.1 Compatibility
- no-hook agents unchanged.
- existing two-arg `onResponse` still works.
- scheduled-source turns preserve same hook semantics as inbound turns.

### 12.2 Policy Correctness
- `beforeLLM.skip_llm` avoids LLM call.
- `beforeLLM.route_flow` routes deterministically.
- `beforeResponse.cancel` suppresses send.
- `beforeResponse.replace` overrides outbound payload.

### 12.3 Flow/HITL Integration
- policy hooks apply to classic and flow outputs.
- HITL pauses continue to be controlled by interrupts.
- policy hooks apply to scheduled outputs as well.
- policy hooks apply to segment fan-out recipient turns as well.

### 12.4 Reliability
- duplicate inbound ids do not reapply policy side effects.
- hook errors produce deterministic fallback + telemetry.

### 12.5 Observability
- lifecycle events emitted with correlation metadata.
- `onResponse.meta` reflects policy/flow/hitl state.
- scheduled turns include scheduling metadata in lifecycle events and `onResponse.meta.source='scheduled'` when scheduled source is used.
- campaign scheduled turns include recipient-level correlation metadata in lifecycle events.

## Sync Contract (Bi-Directional Alignment)

This RFC, `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`, and `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md` MUST remain aligned on these invariants:
1. command-first ordering.
2. flow-only router decision scope.
3. policy hooks apply to classic + flow + scheduled outputs.
4. `reply` required-by-default posture.
5. `onResponse` remains post-send/post-persist side effect.
6. HITL state is represented in response metadata.
7. scheduled source is first-class and carries scheduling metadata in lifecycle context.
8. segment fan-out turns follow the same lifecycle/policy semantics as other scheduled turns.
9. scheduler control-plane and agent tool-plane remain split; segment targeting is not exposed to agent tools.
10. lifecycle stage transitions are committed on top of durable checkpoint/wait/outbox guarantees defined in `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`.
