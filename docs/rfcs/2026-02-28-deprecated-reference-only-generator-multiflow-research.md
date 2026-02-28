# RFC: Generator-Based Multi-Flow Orchestration (Research)

- **Date:** 2026-02-28
- **Status:** Research Draft
- **Scope:** Non-committed proposal for experimental validation
- **Authoring intent:** Define a decision-complete architecture for validating generator-based flows without breaking current event-driven APIs.

## 1. Problem Statement and DX Pain in Hook-Only Model

Zupa's current developer experience is hook-oriented and phase-oriented: users define `prompt`, optional `tools`, `commands`, `context`, and `onResponse`; runtime phases execute deterministically. This model is strong for general request/response behavior, but it is awkward for conversational logic that is naturally bi-directional and stepwise.

Current pain points for advanced conversational workflows:
- Multi-step logic is scattered across `context`, command handlers, tool hooks, and `onResponse`.
- Developers manually reconstruct state-machine behavior using `session.kv` and conditional checks.
- Composable conversation modules (for example tutor flow + reminder flow + support flow) are not first-class.
- Intent-based transitions across modular conversations require custom glue logic.

The target outcome is to add a flow-native model where execution pauses and resumes with explicit data exchange at each step, while preserving the existing event-driven path as fully supported and default.

## 2. Current Codebase Baseline and Constraints

Current baseline (already implemented):
- Configuration entrypoint: `createAgent` with `prompt`, `tools`, `commands`, `context`, `onResponse`, provider overrides, runtime knobs.
- Deterministic kernel phases in fixed order.
- Command pre-LLM gate and tool dispatch in `agentic_loop`.
- Session-scoped KV and persistence via database adapter.
- Dedup guard based on inbound event identity.
- Retry/timeout controls for LLM/tool/STT/TTS calls.

Key constraints this RFC must respect:
- No behavior regression for agents that do not opt into flow features.
- Existing `commands`, `tools`, and `onResponse` contracts remain valid.
- Kernel determinism and replayability remain explicit design constraints.
- Runtime remains resilient under duplicates, timeouts, and restarts.

## 3. Proposed Generator Flow Model and Effect Contract

### 3.1 Design Goal

Introduce async generator flows as first-class orchestration units for conversational state transitions.

### 3.2 Proposed Additive API Surface

```ts
import { createAgent, defineFlow } from 'zupa'

const agent = createAgent({
  prompt: 'You are practical and friendly.',
  flows: {
    tutor: defineFlow(async function* tutorFlow(ctx) {
      const name = yield { type: 'ask', key: 'name', text: "What's your name?" }
      yield { type: 'say', text: `Nice to meet you, ${String(name)}.` }
      const sentence = yield { type: 'ask', key: 'sentence', text: 'Send one sentence in English.' }
      yield { type: 'tool', name: 'correct_sentence', args: { sentence } }
      yield { type: 'handoff', to: 'reminder' }
    }),
    reminder: defineFlow(async function* reminderFlow(ctx) {
      const task = yield { type: 'ask', key: 'task', text: 'What should I remind you about?' }
      const delay = yield { type: 'ask', key: 'delay', text: 'When should I remind you?' }
      yield { type: 'tool', name: 'schedule_reminder', args: { task, delay } }
      yield { type: 'end', reason: 'reminder_scheduled' }
    })
  }
})
```

### 3.3 Proposed Types

```ts
type FlowDefinition = (ctx: FlowContext) =>
  AsyncGenerator<FlowYield, FlowReturn, FlowResumeInput>;

type FlowYield =
  | { type: 'say'; text: string }
  | { type: 'ask'; text: string; key: string }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'handoff'; to: string; input?: unknown }
  | { type: 'end'; reason?: string };

type FlowResumeInput = unknown;
type FlowReturn = { reason?: string } | void;
```

### 3.4 FlowContext Contract (Proposed)

`FlowContext` extends the existing user-facing runtime context with safe helpers:
- `ctx.user`, `ctx.session`, `ctx.inbound`, `ctx.replyTarget`, `ctx.resources`.
- `ctx.endSession()`.
- `ctx.startFlow(flowId, input?)` (alias for yielding `handoff` semantics in helper form).
- `ctx.getActiveFlowState()` for introspection.

No direct mutable access to internal kernel state is exposed.

## 4. Dual Routing Model and Selection Algorithm

### 4.1 Why Two Paths

Flow routing must support both:
- configurable dedicated detector for higher control,
- low-friction route from existing structured outputs.

### 4.2 Proposed Router Config

```ts
type FlowRouterConfig =
  | {
      mode: 'detector';
      prompt: string;
      outputSchema: ZodSchema<{ intent: string; confidence?: number }>;
      minConfidence?: number;
      fallback?: 'classic' | string;
    }
  | {
      mode: 'schema_intent';
      field: string; // e.g. 'intent'
      fallback?: 'classic' | string;
    };
```

### 4.3 Selection Algorithm

When an inbound message is not handled by command path:
1. If session has `activeFlowId`, resume that flow.
2. Else if `flowRouter` configured:
- `detector` mode:
  - call LLM classifier with routing prompt + lightweight context.
  - parse structured intent.
  - if confidence < `minConfidence`, use fallback.
- `schema_intent` mode:
  - if configured output has `field`, map to flow id.
  - if missing/unknown, use fallback.
3. Else no selected flow and continue classic `agentic_loop`.
4. If selected flow id is unknown at runtime, treat as routing failure and fallback.

Fallback default: `'classic'`.

### 4.4 Command Overrides

Commands are evaluated first (existing behavior). New optional command helpers can intentionally start flows:
- `/flow tutor`
- `/flow stop`
- `/flow status`

These are experimental and disableable like other commands.

## 5. Interop Contract with `onResponse`, Commands, Tools, and Classic Prompt Path

### 5.1 Compatibility Rule

Event-driven APIs remain fully valid. Flow orchestration is additive.

### 5.2 Universal `onResponse` Contract

`onResponse` runs for both paths (`classic` and `flow`) once per completed turn.

Proposed extension:

```ts
type ResponseMeta = {
  source: 'classic' | 'flow';
  flowId?: string;
  handoffFrom?: string;
};

onResponse?: (structured: T, ctx: AgentContext, meta?: ResponseMeta) => Promise<void>
```

Compatibility behavior:
- Existing two-argument handlers remain valid.
- Runtime may invoke with optional third `meta` argument.

### 5.3 Tool Reuse

Flow `tool` yields call the same `dispatchToolCall` path used by `agentic_loop`, including:
- schema validation,
- before/handler/after lifecycle,
- timeout + retry guardrails,
- recoverable error formatting.

### 5.4 Classic Path Fallback

If no flow is selected/active, current LLM-driven `agentic_loop` and response finalization run unchanged.

## 6. State Persistence and Deterministic Replay Model

Flow execution state is persisted in session-scoped KV and optionally mirrored in message metadata for audit.

### 6.1 Persisted Keys (Reserved Namespace)

- `__zupa.flow.activeFlowId: string | null`
- `__zupa.flow.flowFrame: { step: number; lastYield?: FlowYield; vars?: Record<string, unknown> }`
- `__zupa.flow.pendingAskKey: string | null`
- `__zupa.flow.lastFlowEventId: string | null`

### 6.2 Deterministic Advancement Rules

- At most one flow step transition commit per inbound event id.
- Duplicate event id must not advance flow state (`claimInboundEvent` gate applies).
- Commit order per inbound:
  1. restore active flow snapshot,
  2. execute yields until pause/termination,
  3. persist new snapshot atomically with session KV update,
  4. emit outbound effects.

### 6.3 Replay Requirements

Given persisted flow snapshot + inbound message timeline, runtime should be able to reconstruct the same flow decisions and effect sequence modulo external nondeterminism (provider latency, third-party side effects).

## 7. Failure Modes and Fallback Behavior

Failure handling is explicit and non-fatal whenever possible.

Routing failures:
- detector parse error => fallback route.
- unknown flow id => fallback route.
- confidence below threshold => fallback route.

Flow execution failures:
- invalid `tool` yield parameters => recoverable tool result fed back to flow.
- tool timeout => recoverable timeout text, flow may continue or end.
- unresolved handoff target => terminate flow and fallback to classic response.
- repeated unexpected exceptions in a flow step => clear active flow, send fallback reply.

Recovery guarantees:
- do not crash runtime process for flow-local errors.
- maintain exactly-once flow advancement per dedup key.
- preserve universal `onResponse` invocation when a reply is produced.

## 8. Alternatives Considered and Rejected

1. **Flow-only rewrite (replace hook model)**
- Rejected: breaks current users and migration simplicity.

2. **Nested flow stacks in first iteration**
- Rejected for phase 1: harder persistence/debug/replay surface.
- Deferred to follow-up RFC after single-active model validation.

3. **Parallel active flows per session**
- Rejected: conflicts with deterministic single-conversation semantics and increases race risks.

4. **Sync generators as primary primitive**
- Rejected: awkward for IO-heavy runtime.
- Async generators chosen as primary; sync support can be sugar later.

5. **Flow-specific response hooks only**
- Rejected: splits side-effect logic and hurts compatibility.
- Universal `onResponse` with metadata is preferred.

## 9. Experiment Plan and Success Metrics

### 9.1 Stage 0: Internal Design Validation

Build behind hidden flag and validate with fake providers.

Required scenarios:
- Compatibility:
  - no-flow agents unchanged,
  - existing `onResponse` still called once.
- Routing:
  - detector mode route success,
  - schema-intent route success,
  - low-confidence fallback to classic.
- Flow execution:
  - `ask` pause/resume,
  - `tool` yield execution and resume value,
  - `handoff` transition and completion.
- Reliability:
  - dedup prevents double-advance,
  - timeout/retry bounds respected,
  - restart resumes from persisted flow snapshot.
- Observability:
  - telemetry marks `source=flow|classic`,
  - route and handoff events emitted.

### 9.2 Proposed KPIs

- Flow-routing precision on curated intent dataset.
- End-to-end turn latency delta vs classic path.
- Flow interruption recovery success rate.
- Duplicate inbound safety (zero double-advance defects in test matrix).
- Developer ergonomics (time-to-implement benchmark scenarios).

## 10. Rollout Path from Experimental Flag to Possible GA

### Stage 0 (Private)
- Hidden flag: `experimental.flows = true`.
- No compatibility guarantees.
- Internal test matrix only.

### Stage 1 (Developer Experimental)
- Public docs marked experimental.
- Opt-in APIs exposed but subject to change.
- Telemetry events and feedback channel enabled.

### Stage 2 (Public Experimental Hardening)
- Stabilize surface names and semantics.
- Add migration notes from early experimental variants.
- Track reliability SLOs and DX survey inputs.

### Stage 3 (GA Decision)
GA requires:
- no known correctness regressions in classic path,
- deterministic replay constraints satisfied,
- reliability and latency targets met,
- final API review approved.

## Assumptions and Defaults

- Flow orchestration is additive, not a replacement.
- Async generators are primary.
- Single active flow + handoff is in scope.
- Router optional for simple agents; required for auto-selection among multiple flows.
- `onResponse` remains universal and receives source metadata when available.

## Open Questions for Follow-up RFCs

- Whether to support nested flow stacks and how to serialize them.
- Whether flow-level local variables should be explicitly declared for deterministic snapshots.
- Whether detector should support model-free rule tables as first-class configuration.
- How to standardize flow visualization in built-in UI without coupling to implementation internals.
