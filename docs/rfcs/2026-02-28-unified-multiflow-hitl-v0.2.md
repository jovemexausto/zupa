# RFC: Unified Multi-Flow + Native HITL (v0.2 Research Spec)

- **Date:** 2026-02-28
- **Status:** Research Draft (Spec-Only)
- **Target:** Zupa v1.x kernel + flows experimental track
- **Supersedes (partial):** `docs/rfcs/2026-02-28-generator-multiflow-research.md`
- **Companion concept source:** "Zupa RFC-001: Native Human-in-the-Loop (HITL) Support - Three Canonical Patterns" (concept draft, Feb 2026)
- **Normative lifecycle reference:** `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`
- **Normative scheduling reference:** `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`
- **Normative durability reference:** `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`

## 1. Purpose and Scope

This RFC unifies two active design lines in Zupa:
- generator-based multi-flow orchestration, and
- native human-in-the-loop (HITL) patterns.

This cycle is documentation only. No runtime code is changed in this RFC.

Normative scope:
- define one coherent model where flow routing chooses flow,
- define HITL as explicit interrupt primitives inside flow execution,
- define security, persistence, replay, and observability guarantees,
- define staged delivery so the highest-value safe patterns land first.

Out of scope for this version:
- full admin UI product design,
- nested flow stacks,
- parallel active flows in one session.

## 2. Baseline and Constraints from Current Zupa Runtime

Current baseline in repository:
- deterministic kernel node pipeline exists,
- command dispatch occurs before LLM loop,
- tools and `onResponse` are stable event-driven extension points,
- session KV persistence and inbound dedup are present.

Hard constraints this RFC MUST satisfy:
1. Agents without flows MUST behave as today.
2. Existing commands/tools MUST remain compatible.
3. HITL cannot rely on non-existent APIs (for example `agent.use(...)` middleware in current runtime).
4. Security for privileged human actions MUST be explicit and pluggable.
5. Pause/resume semantics MUST be durable across restarts.

## 3. Unified Model Overview

The unified model has three layers:
1. **Routing layer:** chooses which flow to run (or classic path).
2. **Flow layer:** `async function*` coroutine with explicit effects.
3. **Interrupt layer:** HITL primitives represented as explicit flow effects.

Core decision:
- Router is **flow-only**. Router does not auto-trigger HITL.
- HITL is explicit in flow logic via interrupt effects.

Four HITL patterns are preserved, with staged guarantees:
- Pattern A: user confirmation in-thread.
- Pattern B: async admin resolution out-of-thread.
- Pattern C: live takeover in-thread (phased later).
- Pattern D: session-exclusive admin proxy bridge (phased later).

## 4. Public API Proposals (Experimental, Non-Final)

### 4.1 AgentConfig Additions

```ts
type AgentConfig<T extends { reply: string }> = {
  // existing fields omitted
  flows?: Record<string, FlowDefinition | FlowRegistration>;
  flowRouter?: FlowRouterConfig;
  hitl?: HitlConfig;
  adminAuth?: AdminAuthConfig;
  beforeLLM?: (input: BeforeLLMInput, ctx: AgentContext) => Promise<BeforeLLMDecision | void>;
  beforeResponse?: (input: BeforeResponseInput, ctx: AgentContext) => Promise<BeforeResponseDecision | void>;
  onResponse?: (structured: T, ctx: AgentContext, meta?: ResponseMeta) => Promise<void>;
};
```

### 4.2 Flow and Effect Types

```ts
type FlowDefinition = (ctx: FlowContext) =>
  AsyncGenerator<FlowEffect, FlowReturn, FlowResumeInput>;

type FlowRegistration = {
  run: FlowDefinition;
  description?: string;
  inputSchema?: ZodTypeAny;
  asTool?: boolean | { alias?: string };
};

type FlowEffect =
  | { type: 'say'; text: string }
  | { type: 'ask'; key: string; text: string }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'handoff'; to: string; input?: unknown }
  | { type: 'end'; reason?: string }
  | InterruptConfirmEffect
  | InterruptEscalateEffect
  | InterruptWaitEffect
  | InterruptProxyStartEffect
  | InterruptProxyWaitEffect
  | InterruptProxyStopEffect;

type InterruptConfirmEffect = {
  type: 'interrupt.confirm';
  id?: string;
  question: string;
  timeoutSeconds?: number;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  responseSchema?: ZodTypeAny;
};

type InterruptEscalateEffect = {
  type: 'interrupt.escalate';
  id?: string;
  mode: 'async_resolution' | 'live_takeover';
  reason: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
  timeoutSeconds?: number;
};

type InterruptWaitEffect = {
  type: 'interrupt.wait';
  waitFor:
    | 'confirm_response'
    | 'admin_resolution'
    | 'live_handback'
    | 'timeout';
  timeoutSeconds?: number;
};

type InterruptProxyStartEffect = {
  type: 'interrupt.proxy.start';
  target: string; // registered HITL target key
  mode?: 'mirror' | 'shadow';
  replace?: boolean;
  timeoutSeconds?: number;
  forwardUserMessages?: boolean;
  forwardAdminMessages?: boolean;
  autoPrefix?: boolean;
};

type AdminProxyInput = {
  proxyId: string;
  target: string;
  text: string;
  raw?: unknown;
};

type AdminProxyDecision = {
  forwardToUser?: boolean;
  text?: string;
  endProxy?: boolean;
  reason?: string;
};

type InterruptProxyWaitEffect = {
  type: 'interrupt.proxy.wait';
  timeoutSeconds?: number;
  timeoutBehavior?: 'continue' | 'end_proxy' | 'fallback_escalation';
  timeoutMessageToUser?: string;
  processBeforeForward?: (input: AdminProxyInput, ctx: FlowContext) => Promise<AdminProxyDecision>;
};

type InterruptProxyStopEffect = {
  type: 'interrupt.proxy.stop';
  reason?: string;
};

type FlowResumeInput = unknown;
type FlowReturn = void | { reason?: string };
```

### 4.2.1 Flow Exposure as LLM-Callable Tool (`asTool`)

When `asTool` is enabled on a `FlowRegistration`, runtime MAY expose the flow as a callable tool for the LLM planner.

Normative mapping:
- Tool identifier defaults to the flow key (`flowId`).
- Optional `asTool: { alias }` MAY override tool identifier for collision/UX cases.
- Tool description defaults to `FlowRegistration.description` when provided.
- Tool parameter schema defaults to `FlowRegistration.inputSchema` when provided.

Explicit non-goal for v0.2:
- no dedicated `toolName` / `toolDescription` flow fields are introduced in this RFC.

### 4.3 Helper Sugar (Non-Canonical)

`FlowContext` MAY expose wrappers:
- `ctx.confirm(opts)` -> yields `interrupt.confirm`
- `ctx.escalate(opts)` -> yields `interrupt.escalate`
- `ctx.wait(opts)` -> yields `interrupt.wait`
- `ctx.proxyToAdmin(opts)` -> yields `interrupt.proxy.start` / `interrupt.proxy.stop`
- `ctx.waitForAdminInput(opts)` -> yields `interrupt.proxy.wait`

Canonical runtime contract remains `FlowEffect` values. Helper wrappers MUST compile to the same effect objects.

### 4.4 Flow Router (Flow-Only)

```ts
type FlowRouterConfig =
  | {
      mode: 'detector';
      prompt: string;
      outputSchema: ZodType<{ flow?: string; confidence?: number }>;
      minConfidence?: number;
      fallback?: 'classic' | string;
    }
  | {
      mode: 'schema_flow';
      field: string; // e.g. 'flow'
      fallback?: 'classic' | string;
    };
```

Router output MUST only influence flow selection. HITL trigger decisions are flow-authored.

### 4.5 HITL and Admin Auth Configuration

```ts
type HitlConfig = {
  confirmDefaults?: {
    timeoutSeconds?: number;
    // TODO: allow sync functions for positive/negative extraction / detection
    // this way we give more flexibility by using regex or custom logic
    positiveKeywords?: string[];
    negativeKeywords?: string[];
  };
  escalationDefaults?: {
    timeoutSeconds?: number;
    fallbackMode?: 'classic' | 'end_flow' | 'retry';
    autoAckText?: string;
  };
  asyncPendingPolicy?: {
    behavior: 'noop' | 'ack' | 'queue';
    ackText?: string;
  };
};

type AdminActor = {
  id: string;
  role?: string;
  channel: 'whatsapp' | 'ui_api';
  metadata?: Record<string, unknown>;
};

type AdminAction =
  | 'hitl.takeover.start'
  | 'hitl.takeover.end'
  | 'hitl.escalation.resolve'
  | 'hitl.escalation.view';

type AdminAuthConfig = {
  resolveActor(input: { inbound?: InboundMessage; request?: { headers: Record<string, string | undefined> } }): Promise<AdminActor | null>;
  can(action: AdminAction, actor: AdminActor, session: ActiveSession): Promise<boolean>;
};
```

### 4.6 Command Contract Integration

Existing command contract remains valid. RFC proposes additive access guard concept:

```ts
type CommandAccess = 'public' | 'admin';

type CommandDefinition<TArgs extends ZodType = never> = {
  description: string;
  access?: CommandAccess;
  args?: TArgs;
  handler: (ctx: AgentContext, args?: unknown) => Promise<void>;
};
```

`access: 'admin'` MUST call `adminAuth.resolveActor` and `adminAuth.can` before handler execution.

### 4.7 onResponse Metadata

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

Backward compatibility MUST be maintained: existing two-argument `onResponse` handlers continue to work.

### 4.9 Response Lifecycle Policy Layer (Normative Reference)

Lifecycle policy semantics are defined normatively in:
`docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`.

This unified RFC constrains integration-level behavior:
1. `beforeLLM` runs after command gate and before flow/router/classic processing.
2. `beforeResponse` runs for both classic and flow-generated response candidates.
3. `onResponse` remains post-send/post-persist side-effect hook.
4. `reply` remains required-by-default in structured output mode.

### 4.10 Scheduled Flow Triggers (Normative Reference)

Scheduled autonomous flow semantics are defined normatively in:
`docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`.

This unified RFC constrains integration-level behavior:
1. Scheduled source turns are first-class pipeline inputs (`source='scheduled'`).
2. Scheduled turns use the same policy lifecycle (`beforeLLM`, `beforeResponse`, `onResponse`).
3. Cron and one-off triggers are both in scope for v1 scheduling model.
4. During active HITL, scheduled triggers are canceled by default.
5. Campaign/broadcast segmentation is first-class and executes via recipient-level fan-out through the same kernel lifecycle.
6. Scheduler access is split: trusted control-plane APIs may manage segment targets, while agent-callable scheduler tools are current-user scoped and must not expose segment targeting.

### 4.8 Runtime/Admin Control Surface

RFC proposes runtime admin API (adapter entrypoint):

```ts
resolveEscalation(target: { sessionId?: string; escalationId?: string }, resolution: {
  approved: boolean;
  message?: string;
  actionData?: Record<string, unknown>;
  resolvedBy?: string;
}): Promise<void>
```

Adapters (UI/API or command path) MUST use resolver core for authorization.

## 5. Kernel Semantics and Execution Order

### 5.1 Branch Order (Normative)

For inbound message handling, kernel MUST follow this order:
1. command dispatch gate
2. `beforeLLM`
3. resume active flow if present
4. else run flow router (if configured)
5. if flow selected, run flow engine
6. else run classic agentic loop path
7. response candidate creation
8. `beforeResponse`
9. transport send (or cancel)
10. persistence
11. `onResponse`

Detailed stage semantics and fallback/error contracts are owned by the lifecycle RFC.

### 5.2 Command Interaction with HITL

- Public commands continue to work as today.
- Admin commands for takeover/handback/resolve MUST respect admin resolver checks.
- During live takeover, only allowed admin/control paths SHOULD bypass no-op suppression.

### 5.3 Scheduled Source Execution

For scheduled-trigger turns:
1. Command gate is effectively no-op for scheduled source.
2. Standard branch/policy order still applies (including `beforeLLM` and `beforeResponse`).
3. If target session is under active HITL state, scheduled run is canceled by default and emitted as observable cancellation.
4. Session bootstrap behavior is controlled by schedule-level `allowSessionBootstrap`.
5. Segment-target schedules resolve recipients at trigger time and execute recipient-level turns with independent outcomes.
6. If a flow tool invokes scheduler operations, runtime MUST enforce current-user scope and reject any segment/campaign target mutation from tool arguments.

## 6. HITL Interrupt Semantics

### 6.1 interrupt.confirm

Runtime MUST:
1. emit request prompt to user,
2. persist pending confirmation state,
3. pause flow,
4. resume on user reply or timeout,
5. return boolean or parsed structured payload when schema is supplied.

Timeout behavior MUST be deterministic and configurable.

### 6.2 interrupt.escalate

Runtime MUST:
1. create durable escalation record/state,
2. set session HITL state to pending resolution or live takeover,
3. emit escalation events,
4. pause or transition flow according to mode.

If requested mode is unavailable (for example live adapter not enabled), runtime SHOULD fallback per `HitlConfig.escalationDefaults`.

### 6.3 interrupt.wait

Runtime MUST pause until one allowed resolver event occurs:
- human response for confirm,
- admin resolution,
- live handback,
- timeout.

Resume payload MUST include enough data for deterministic continuation.

### 6.4 interrupt.proxy.start

Runtime MUST:
1. create or resume a proxy bridge bound to the current session,
2. persist proxy state with correlation id (`proxyId`) and target key,
3. enforce exclusive session scope (only one active proxy bridge per session),
4. if a proxy is already active: reject by default; only replace when `replace=true` and perform atomic stop+start.

Target resolution MUST use registered server-side HITL target keys, not model-provided raw destination identifiers.

### 6.5 interrupt.proxy.wait

Runtime MUST:
1. pause flow until admin-side input is received on the active proxy bridge or timeout occurs,
2. bind wait semantics to the single active proxy bridge for the session,
3. invoke `processBeforeForward` when provided before forwarding/resuming behavior is finalized.

`processBeforeForward` MUST be async function-only in v0.2 (no generator/yield semantics inside hook) to preserve deterministic replay boundaries.

On timeout, runtime MUST deterministically resume with timeout result and apply configured timeout behavior (including optional auto-stop and user-facing timeout message).

### 6.6 interrupt.proxy.stop

Runtime MUST end the active proxy bridge for the session and clear proxy state. Stop behavior MUST be idempotent.

### 6.7 No-op Semantics During Pause

Live takeover active:
- AI outbound MUST be suppressed.
- inbound from user MUST route to human adapter path.
- handback event resumes AI flow.

Async resolution pending:
- runtime behavior MUST follow configured policy (`noop`, `ack`, `queue`).
- queue mode SHOULD store inbound context references for replayable resume.

Admin proxy active:
- bridge forwarding behavior MUST follow active proxy mode (`mirror` or `shadow`) and forwarding flags,
- inbound dedup rules MUST prevent proxy loops or duplicate forwards,
- timeout or explicit stop returns control to normal flow execution.

## 7. Security and Authorization Model

### 7.1 Resolver Core

Resolver core is mandatory for privileged HITL operations.

Normative requirements:
- Every privileged action MUST pass `resolveActor` + `can`.
- Denials MUST be auditable via telemetry events.
- Runtime MUST never assume `ctx.admin` exists.
- Admin inbound accepted as proxy input MUST pass resolver checks before becoming resumable flow input.

### 7.2 Adapters

Two adapters are supported under same core:
1. WhatsApp admin-command adapter.
2. UI/API adapter (token/JWT guarded endpoint).

Adapters SHOULD share the same action names and audit metadata.

### 7.3 Transport Neutrality

Security logic MUST remain transport-agnostic. Transport adapters only provide identity signals; authorization policy remains in resolver.

## 8. Persistence, Determinism, and Replay

### 8.1 Reserved Session Keys

Existing flow keys are preserved. HITL adds reserved namespace:
- `__zupa.hitl.mode`
- `__zupa.hitl.escalationId`
- `__zupa.hitl.pendingSince`
- `__zupa.hitl.lastEventId`
- `__zupa.hitl.proxyId`
- `__zupa.hitl.proxyTarget`
- `__zupa.hitl.proxyMode`

### 8.2 Exactly-Once Advancement

Runtime MUST keep exactly-once progression per inbound dedup identity.

Required order:
1. load session + flow/HITL snapshot,
2. evaluate next effect,
3. commit snapshot atomically,
4. emit outbound effects/events.

Duplicate inbound IDs MUST not advance paused flow/HITL state.

### 8.3 Replayability

Given inbound timeline + session snapshots + escalation events, operator SHOULD be able to reconstruct state transitions for audit/debug.

## 9. Observability and Auditability

Required events:
- `hitl.interrupt.paused`
- `hitl.interrupt.resumed`
- `hitl.confirm.requested`
- `hitl.confirm.resolved`
- `hitl.confirm.timed_out`
- `hitl.escalation.created`
- `hitl.escalation.resolved`
- `hitl.escalation.timed_out`
- `hitl.live_takeover.started`
- `hitl.live_takeover.ended`
- `hitl.proxy.started`
- `hitl.proxy.input_received`
- `hitl.proxy.forwarded`
- `hitl.proxy.stopped`
- `hitl.proxy.timed_out`

Event payload SHOULD include:
- `requestId`, `sessionId`, `flowId`, `escalationId`,
- actor identity when admin action occurs,
- decision/timeout reason,
- timestamp and source channel.

`onResponse` metadata MUST align with current HITL state transition to prevent integration drift.

## 10. Compatibility and Migration from Prior Drafts

This RFC explicitly corrects concepts that do not match current Zupa runtime:

1. `function*` examples are replaced by `async function*`.
2. `agent.use(...)` middleware is removed (not current runtime surface).
3. `adminOnly` shortcut is not normative core; resolver-based authorization is.
4. `ctx.admin` is not assumed.
5. examples use current context shape (`ctx.resources.transport`, `session.kv`).

Migration guidance:
- Existing event-driven agents require no changes.
- Flow adoption is opt-in.
- HITL features are opt-in and gated by experimental configuration.

## 11. Validation Matrix (Test Cases and Scenarios)

### 11.1 Compatibility

- Agents without `flows` MUST keep current behavior.
- Commands/tools/onResponse MUST behave unchanged when HITL disabled.
- Agents without schedules MUST keep current behavior.

### 11.2 Flow + HITL Correctness

- `interrupt.confirm` returns expected decision on positive/negative/timeout paths.
- `interrupt.escalate` + `interrupt.wait` resumes after admin resolution.
- live takeover suppresses AI and resumes on handback.
- `interrupt.proxy.start` enforces single active proxy bridge per session.
- `interrupt.proxy.wait` resumes on admin input and applies timeout deterministically.
- `interrupt.proxy.stop` cleanly returns execution to non-proxy flow path.
- `beforeResponse` policy decisions apply equally to classic and flow outputs.

### 11.3 Reliability

- duplicate inbound IDs do not double-advance paused states.
- restart resumes from persisted flow + HITL snapshot.
- timeout fallback is deterministic under configured policy.
- policy-hook failures degrade deterministically (default continue) with emitted failure telemetry.
- scheduler claim rules prevent duplicate execution of same scheduled occurrence.
- campaign fan-out supports partial recipient failures without invalidating successful recipients.
- proxy bridge correlation (`proxyId`) survives restart and does not duplicate forward/resume actions under duplicated inbound IDs.

### 11.4 Security

- unauthorized takeover and resolve attempts are denied.
- resolver decisions and denials are emitted and auditable.
- scheduler tool attempts to create/update segment-target schedules are denied and auditable.
- unauthorized admin proxy input attempts are denied and auditable.

### 11.5 Observability

- required HITL events are emitted with correlation metadata.
- `onResponse.meta` reflects true flow/HITL state.
- response lifecycle events (`response:prepared|sent|persisted|failed`) are emitted with policy action metadata.
- schedule lifecycle events are emitted with scheduled-source correlation fields.
- campaign/segment runs emit recipient-level schedule events and metadata.
- proxy lifecycle events are emitted with `proxyId`, session, flow, and actor correlation metadata.

## 12. Phased Rollout Plan

### Phase A (Experimental Core)

MUST deliver:
- durable runtime foundation contracts/checkpoint model as defined in `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`,
- flow engine baseline,
- `interrupt.confirm`,
- async admin resolution (`interrupt.escalate` + `interrupt.wait`),
- response lifecycle policy hooks (`beforeLLM`, `beforeResponse`) on current send-first pipeline,
- scheduled flow triggers (cron + one-off) with first-class session + campaign segmentation support,
- resolver core,
- observability events,
- compatibility guarantees.

### Phase B (Live Takeover Hardening)

MUST deliver:
- admin proxy mode (`interrupt.proxy.start` / `interrupt.proxy.wait` / `interrupt.proxy.stop`) with exclusive-per-session bridge semantics,
- live takeover mode,
- AI no-op suppression + handback semantics,
- adapter hardening for transport and admin channels,
- concurrency/race-condition test coverage,
- outbox persist-before-send response lifecycle hardening (as defined in lifecycle RFC follow-up node),
- external queue scheduler executor hardening.

### Phase C (GA Hardening)

MUST deliver:
- finalized API naming,
- migration notes from experimental surface,
- reliability SLO and audit completeness sign-off,
- documentation in English and Portuguese.

## 13. Non-Goals

- Building a complete admin UI product in this RFC.
- Supporting nested flow stacks.
- Supporting parallel active flows in one session.
- Replacing event-driven Zupa APIs.

## 14. Open Questions for v0.3

1. Should nested flow stack semantics be introduced and how serialized?
2. Should queue-mode async escalation replay entire inbound payloads or references?
3. Should command access support richer policy labels beyond `public|admin`?
4. Should resolver core include first-class rate limits and dual-approval patterns?
5. Should `processBeforeForward` gain a constrained policy-plugin DSL in v0.3 without becoming a coroutine surface?

## Appendix A: Compatibility Mapping (Old Examples -> Corrected Zupa-Native Examples)

### A.1 User Confirmation Pattern

| Previous Draft Style | Corrected Style |
|---|---|
| `function* bookingFlow(ctx)` | `async function* bookingFlow(ctx)` |
| `yield ctx.confirm(...)` only | canonical `yield { type: 'interrupt.confirm', ... }` (helper allowed as sugar) |

Corrected example:

```ts
const booking = async function* (ctx: FlowContext) {
  const date = yield { type: 'ask', key: 'date', text: 'When do you want the appointment?' };

  const confirmed = yield {
    type: 'interrupt.confirm',
    question: `Confirm booking for ${String(date)}? Reply YES or NO`,
    timeoutSeconds: 300,
    positiveKeywords: ['yes', 'ok', 'confirm'],
    negativeKeywords: ['no', 'cancel']
  };

  if (!confirmed) {
    yield { type: 'say', text: 'Booking cancelled.' };
    yield { type: 'end', reason: 'user_declined' };
    return;
  }

  yield { type: 'tool', name: 'create_appointment', args: { date } };
  yield { type: 'say', text: 'Booked.' };
};
```

### A.2 Live Takeover Pattern

| Previous Draft Style | Corrected Style |
|---|---|
| `adminOnly: true` shortcut | command `access: 'admin'` + resolver core authorization |
| `ctx.admin.id` | `adminAuth.resolveActor(...)` result managed by runtime/adapter |
| `agent.use(...)` middleware no-op | kernel-owned no-op semantics based on HITL state |

Corrected conceptual command sketch:

```ts
commands: {
  takeover: {
    description: 'Start live takeover',
    access: 'admin',
    handler: async (ctx) => {
      await ctx.session.kv.set('__zupa.hitl.mode', 'live_takeover');
      await ctx.resources.transport.sendText(ctx.replyTarget, 'A human agent joined this conversation.');
    }
  },
  handback: {
    description: 'Return to AI mode',
    access: 'admin',
    handler: async (ctx) => {
      await ctx.session.kv.delete('__zupa.hitl.mode');
      await ctx.resources.transport.sendText(ctx.replyTarget, 'Returning to AI assistant mode.');
    }
  }
}
```

### A.3 Async Admin Resolution Pattern

| Previous Draft Style | Corrected Style |
|---|---|
| `yield ctx.escalate(...)` without explicit wait model | `interrupt.escalate` then `interrupt.wait` |
| direct ad-hoc resume | runtime control surface `resolveEscalation(...)` |

Corrected flow sketch:

```ts
const refund = async function* (ctx: FlowContext) {
  const amount = yield { type: 'ask', key: 'amount', text: 'What refund amount?' };

  if (Number(amount) > 500) {
    yield {
      type: 'interrupt.escalate',
      mode: 'async_resolution',
      reason: 'High refund amount requires review',
      priority: 'high',
      metadata: { amount }
    };

    const resolution = yield {
      type: 'interrupt.wait',
      waitFor: 'admin_resolution',
      timeoutSeconds: 86_400
    };

    if (resolution?.approved) {
      yield { type: 'tool', name: 'process_refund', args: { amount } };
      yield { type: 'say', text: 'Refund approved and processed.' };
    } else {
      yield { type: 'say', text: resolution?.message ?? 'Refund not approved.' };
    }
  }
};
```

Admin/API side sketch:

```ts
await agent.resolveEscalation(
  { sessionId: 'session_123' },
  {
    approved: true,
    message: 'Approved after balance verification.',
    actionData: { transactionId: 'tx_123' },
    resolvedBy: 'admin_42'
  }
);
```

### A.4 Response Lifecycle Hooks Pattern

| Previous Draft Style | Corrected Style |
|---|---|
| `onResponse` expected to control sending | `onResponse` is post-send/post-persist side effect |
| no official pre-LLM short-circuit | `beforeLLM` explicit policy decision hook |
| no official pre-send override gate | `beforeResponse` explicit cancel/replace hook |

See normative details in:
`docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`.

### A.5 Scheduled Flows Pattern

| Previous Draft Style | Corrected Style |
|---|---|
| Ad-hoc reminder queue outside kernel lifecycle | First-class scheduled source turn through kernel pipeline |
| One-off scheduling only | Cron + one-off triggers |
| Scheduling bypasses policy hooks | Scheduled source uses `beforeLLM` and `beforeResponse` |
| Campaign segmentation as future-only | Campaign/broadcast segmentation is first-class scheduler scope |
| Agent tool can manage arbitrary schedule targets | Agent tool scheduler surface is current-user scoped only (no segment/campaign target API) |

See normative details in:
`docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`.

### A.6 Admin Proxy Pattern (Session-Exclusive)

| Previous Draft Style | Corrected Style |
|---|---|
| ad-hoc `ctx.adminSend(...)` fire-and-forget with custom correlation | canonical proxy interrupts with kernel-managed correlation and resume |
| multiple concurrent proxy bridges per session | single active proxy bridge per session (replace only with explicit flag) |
| arbitrary raw target identifiers from tool/model arguments | target key resolved from registered server-side HITL targets |
| coroutine logic inside preprocess hook | `processBeforeForward` async-only in v0.2 |

Corrected flow sketch:

```ts
const refundReview = async function* (ctx: FlowContext) {
  yield {
    type: 'interrupt.proxy.start',
    target: 'financeTeam',
    mode: 'mirror',
    timeoutSeconds: 3600
  };

  const adminResult = yield {
    type: 'interrupt.proxy.wait',
    timeoutSeconds: 3600,
    timeoutBehavior: 'end_proxy',
    processBeforeForward: async (input) => {
      if (input.text.includes('APPROVE')) return { forwardToUser: true, text: 'Refund approved.' };
      if (input.text.includes('REJECT')) return { forwardToUser: true, text: 'Refund denied.' };
      return { forwardToUser: true };
    }
  };

  yield { type: 'interrupt.proxy.stop', reason: 'review_complete' };
};
```

## Sync Contract (Bi-Directional Alignment)

This RFC, `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`, and `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md` MUST remain aligned on:
1. command-first ordering.
2. flow-only router decision scope.
3. policy hooks apply to classic + flow + scheduled outputs.
4. `reply` required-by-default posture.
5. `onResponse` as post-send/post-persist side-effect hook.
6. HITL state visibility in response metadata.
7. scheduled source as first-class pipeline input with explicit source metadata.
8. scheduled model supports both session-target and segment-target executions.
9. scheduler control-plane and agent tool-plane are distinct; segment targeting is not exposed to agent tools.
10. flow/HITL/scheduler state transitions rely on durable checkpoint/wait/outbox guarantees defined in `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`.
