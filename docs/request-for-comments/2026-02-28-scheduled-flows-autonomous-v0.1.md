# RFC: Scheduled Flows for Autonomous Session and Campaign Behaviors (v0.1)

- **Date:** 2026-02-28
- **Status:** Research Draft (Spec-Only)
- **Target:** Zupa v1.x kernel + flows experimental track
- **Normative source for:** scheduled autonomous trigger semantics
- **Related umbrella RFC:** `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`
- **Related lifecycle RFC:** `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`
- **Related durability RFC:** `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`

## 1. Problem and Motivation

Personal and productized agents need autonomous behavior even when users are not actively sending messages. Typical use cases include reminders, proactive check-ins, routine nudges, recurring follow-ups, and segmented campaign broadcasts.

Current gap in repository baseline:
- runtime supports inbound-triggered turns only,
- no first-class scheduler/cron primitive exists in runtime contracts,
- documentation references reminder behavior, but runtime/database scheduling primitives are not standardized.

Without native scheduling primitives, developers must create ad-hoc job systems and custom state handoff paths that drift from kernel guarantees.

## 2. Scope and Non-Goals

### In scope (v0.1)
- session-centric scheduled flows for autonomous behaviors.
- campaign/broadcast segmentation as first-class scheduler feature.
- trigger types: recurring cron and one-off run-at.
- schedule definitions via config and runtime API.
- pluggable execution architecture (in-process and external executor).
- integration with flow/HITL and response lifecycle policy hooks.

### Out of scope (v0.1)
- replacing existing inbound pipeline semantics.
- full admin UI scheduler product design.

## 3. Locked Decisions and Defaults

1. Scope priority: session and segmented campaign automation as first-class scheduler capabilities.
2. Trigger model: `cron` + `once(runAt)`.
3. Timezone model: agent-global timezone for v1.
4. Missed-run default: `skip`.
5. Missed-run override: per schedule opt-in catch-up.
6. HITL interop: cancel scheduled run when HITL is active.
7. Policy lifecycle: scheduled turns use same `beforeLLM` / `beforeResponse` / `onResponse` pipeline.
8. Schedule definition: config + runtime API.
9. Engine architecture: pluggable both (in-process poller + external queue executor).
10. Session bootstrap: configurable per schedule via `allowSessionBootstrap`.
11. Security boundary: agent-callable scheduler tools are scoped to current session user only and MUST NOT expose segment/campaign targeting.

## 4. Public API and Type Proposals

### 4.1 AgentConfig Additions

```ts
type AgentConfig<T extends { reply: string }> = {
  // existing fields omitted
  schedules?: Record<string, ScheduleDefinition>;
  scheduler?: SchedulerConfig;
};
```

### 4.2 Schedule Definition

```ts
type ScheduleDefinition = {
  flowId: string;
  trigger:
    | { type: 'cron'; expr: string }
    | { type: 'once'; runAt: string }; // ISO-8601
  target:
    | {
        kind: 'user';
        userExternalId: string;
        sessionId?: string;
      }
    | {
        kind: 'segment';
        campaignId?: string;
        segment: {
          type: 'all' | 'active_since' | 'tag' | 'custom_query';
          activeSinceDays?: number;
          tag?: string;
          query?: string;
        };
      };
  allowSessionBootstrap?: boolean;
  onMissed?: {
    policy: 'skip' | 'catch_up';
    maxRuns?: number;
    maxAgeSeconds?: number;
  };
  metadata?: Record<string, unknown>;
};
```

### 4.3 Scheduler Runtime API

```ts
createSchedule(input: ScheduleDefinition): Promise<{ scheduleId: string }>;
updateSchedule(scheduleId: string, patch: Partial<ScheduleDefinition>): Promise<void>;
cancelSchedule(scheduleId: string): Promise<void>;
listSchedules(filter?: {
  flowId?: string;
  status?: string;
  targetKind?: 'user' | 'segment';
  userExternalId?: string;
  campaignId?: string;
}): Promise<ScheduleRecord[]>;
```

These runtime APIs are trusted control-plane surfaces (application/backend/admin adapters) and may create both `target.kind='user'` and `target.kind='segment'` schedules.

### 4.4 Agent Scheduler Tool Surface (User-Scoped)

```ts
type AgentSchedulerToolApi = {
  createCurrentUserSchedule(input: {
    flowId: string;
    trigger: { type: 'cron'; expr: string } | { type: 'once'; runAt: string };
    allowSessionBootstrap?: boolean;
    onMissed?: { policy: 'skip' | 'catch_up'; maxRuns?: number; maxAgeSeconds?: number };
    metadata?: Record<string, unknown>;
  }): Promise<{ scheduleId: string }>;
  updateCurrentUserSchedule(scheduleId: string, patch: {
    trigger?: { type: 'cron'; expr: string } | { type: 'once'; runAt: string };
    allowSessionBootstrap?: boolean;
    onMissed?: { policy: 'skip' | 'catch_up'; maxRuns?: number; maxAgeSeconds?: number };
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  cancelCurrentUserSchedule(scheduleId: string): Promise<void>;
  listCurrentUserSchedules(filter?: { flowId?: string; status?: string }): Promise<ScheduleRecord[]>;
};
```

Normative security constraints:
- Tool calls MUST derive target identity from active runtime context (`ctx.user.id` / current session linkage), not from model-provided arguments.
- Tool calls MUST NOT accept `segment`, `campaignId`, `userExternalId`, or arbitrary target fields.
- Attempts to create/update schedules outside current-user scope MUST be denied and observable.

### 4.5 Scheduler Runtime Config

```ts
type SchedulerConfig = {
  enabled?: boolean;
  timezone?: string; // agent-global IANA timezone
  executor?: 'in_process' | 'external';
  pollIntervalMs?: number;
  claimTtlSeconds?: number;
  maxConcurrentRuns?: number;
  defaultOnMissed?: {
    policy: 'skip' | 'catch_up';
    maxRuns?: number;
    maxAgeSeconds?: number;
  };
};
```

## 5. Scheduler Abstractions and Persistence

### 5.1 SchedulerStore Contract

```ts
type SchedulerStore = {
  due(now: Date, limit: number): Promise<ScheduleRecord[]>;
  claim(scheduleId: string, scheduledFor: Date, claimUntil: Date): Promise<'claimed' | 'already_claimed' | 'stale'>;
  completeRun(runId: string, outcome: ScheduleRunOutcome, metadata?: Record<string, unknown>): Promise<void>;
  failRun(runId: string, reason: string, retryAt?: Date): Promise<void>;
  cancelSchedule(scheduleId: string, reason?: string): Promise<void>;
};
```

### 5.2 Record Shapes

```ts
type ScheduleRecord = {
  id: string;
  flowId: string;
  targetKind: 'user' | 'segment';
  targetUserExternalId?: string;
  targetSessionId?: string;
  campaignId?: string;
  segmentSelector?: {
    type: 'all' | 'active_since' | 'tag' | 'custom_query';
    activeSinceDays?: number;
    tag?: string;
    query?: string;
  };
  triggerType: 'cron' | 'once';
  cronExpr?: string;
  runAt?: Date;
  timezone: string;
  allowSessionBootstrap: boolean;
  onMissedPolicy: 'skip' | 'catch_up';
  maxRuns?: number;
  maxAgeSeconds?: number;
  nextRunAt: Date | null;
  lastRunAt?: Date;
  status: 'active' | 'paused' | 'canceled' | 'completed';
  version: number;
  metadata?: Record<string, unknown>;
};

type ScheduleRunOutcome = 'success' | 'skipped' | 'failed' | 'canceled_hitl';

type ScheduleRunRecord = {
  id: string;
  scheduleId: string;
  scheduledFor: Date;
  startedAt: Date;
  finishedAt?: Date;
  outcome: ScheduleRunOutcome;
  reason?: string;
  attempt: number;
  requestId?: string;
  targetKind: 'user' | 'segment';
  expandedRecipients?: number;
};

type CampaignRecipientRunRecord = {
  id: string;
  scheduleRunId: string;
  userExternalId: string;
  sessionId?: string;
  requestId?: string;
  outcome: 'success' | 'skipped' | 'failed' | 'canceled_hitl';
  reason?: string;
};
```

## 6. Execution Model and Runtime Semantics

### 6.1 Synthetic Scheduled Turn

Scheduled execution creates a synthetic turn source:
- `source = 'scheduled'`
- includes `scheduleId`, `triggerType`, `scheduledFor`, `runAttempt`

This turn enters the same kernel pipeline used by inbound turns.
For segment targets, each resolved recipient becomes its own synthetic scheduled turn with recipient-level correlation metadata.

### 6.2 Branch Order (Scheduled Source)

1. command gate (no-op for scheduled source)
2. `beforeLLM`
3. active flow resume OR flow router selection OR classic path
4. response candidate creation
5. `beforeResponse`
6. transport send (or cancel)
7. persistence
8. `onResponse`

### 6.3 HITL Interaction Rule

If target session is in active HITL state when trigger fires:
- scheduled run outcome MUST be `canceled_hitl`,
- schedule runtime MUST emit cancellation event,
- default behavior is no deferred replay for this run.

For segment targets, HITL cancellation is evaluated per resolved recipient turn.

### 6.4 Missed Run Rule

Default behavior:
- missed runs are skipped.

Opt-in catch-up behavior per schedule:
- execute missed runs only within configured `maxRuns` and `maxAgeSeconds` bounds.

### 6.5 Session Bootstrap Rule

If target session is not active:
- run only when `allowSessionBootstrap=true`,
- otherwise mark run as `skipped` with reason `bootstrap_disabled`.

### 6.6 Campaign/Broadcast Fan-Out Rule

For `target.kind='segment'` schedules:
1. segment resolution occurs at trigger execution time (not schedule creation time),
2. runtime creates per-recipient execution units and processes them through the same kernel/policy lifecycle,
3. dedup identity MUST include recipient dimension (for example `scheduleId + scheduledFor + userExternalId`),
4. partial failures MUST be recorded per recipient without invalidating successful recipient executions.

### 6.7 Authorization and Target Scope Rule

Runtime MUST enforce two scheduling authority levels:
1. Trusted scheduler API (`createSchedule`, `updateSchedule`, etc.) MAY manage both user-targeted and segment-targeted schedules.
2. Agent scheduler tool API MUST be current-user scoped only and MUST NOT create or mutate segment-targeted schedules.

Authorization checks MUST happen server-side and MUST NOT trust LLM/tool arguments for target selection.

## 7. Pluggable Execution Architecture

### 7.1 In-Process Executor

- scheduler loop runs in agent runtime process,
- periodically polls `due(now)` and claims due runs,
- suitable for local/self-serve deployments.

### 7.2 External Executor

- runtime enqueues due triggers into external worker path,
- worker claims and executes schedule runs using same store contract,
- supports higher durability/scaling needs.

Both executors MUST produce equivalent lifecycle semantics and event payloads.

## 8. Observability and Events

Required events:
- `schedule:created`
- `schedule:updated`
- `schedule:canceled`
- `schedule:triggered`
- `schedule:skipped`
- `schedule:run_started`
- `schedule:run_completed`
- `schedule:run_failed`
- `schedule:run_canceled_hitl`
- `schedule:campaign_resolved`
- `schedule:recipient_run_started`
- `schedule:recipient_run_completed`
- `schedule:recipient_run_failed`
- `schedule:tool_scope_denied`

Payload SHOULD include:
- `scheduleId`, `flowId`, `targetKind`, `userExternalId?`, `sessionId?`, `campaignId?`,
- `recipientUserExternalId?`, `requestId?`, `source='scheduled'`, `scheduledFor`, `attempt`, outcome/reason.

## 9. Failure and Retry Semantics

1. Claiming rules MUST prevent double execution of the same scheduled occurrence.
2. Crash/restart MUST not silently lose in-progress run state.
3. Failed runs MAY be retried according to schedule policy (future extension), but default v0.1 behavior SHOULD be explicit fail with observability.
4. Hook failures (`beforeLLM`, `beforeResponse`) follow lifecycle RFC fallback policy.
5. Campaign fan-out MAY have mixed recipient outcomes; aggregate run status SHOULD preserve partial-success visibility.

## 10. Compatibility and Migration

Compatibility guarantees:
- Agents without schedules remain unchanged.
- Existing flow/HITL and response lifecycle behavior remain valid.
- Scheduled source adopts policy hooks without changing default non-scheduled behavior.

Migration notes:
- Existing ad-hoc reminder systems can migrate to `createSchedule` / config schedules incrementally.
- First migrate one-off reminders, then recurring cron jobs.
- Campaign jobs can migrate by mapping existing audience selectors into `target.kind='segment'` definitions.

## 11. Validation Matrix

### 11.1 Compatibility
- no-schedule agents unchanged.
- scheduled source passes through policy hooks and `onResponse`.

### 11.2 Trigger Correctness
- cron next-run calculation uses agent timezone.
- one-off trigger executes once and terminally completes.

### 11.3 Missed-Run Behavior
- default skip on restart.
- catch-up executes only within configured bounds.

### 11.4 HITL Interaction
- run canceled with `canceled_hitl` when session is in active HITL state.

### 11.5 Bootstrap Behavior
- run skipped when no active session and bootstrap disabled.
- run succeeds when bootstrap enabled.

### 11.6 Reliability
- duplicate claims do not double-run same occurrence.
- executor restart preserves claim/run integrity.

### 11.7 Campaign/Broadcast Segmentation
- segment target resolution happens at trigger time with deterministic selector evaluation.
- fan-out emits per-recipient execution records and events.
- partial recipient failures do not invalidate successful recipients.

### 11.8 Policy Integration
- `beforeLLM.skip_llm` works for scheduled source.
- `beforeResponse.cancel/replace` works for scheduled source.

### 11.9 Observability
- all required schedule events emitted with expected metadata.

### 11.10 Security and Scope
- agent scheduler tool cannot create/update/cancel schedules outside current session user scope.
- agent scheduler tool cannot access segment/campaign targeting surfaces.
- denied out-of-scope tool requests emit `schedule:tool_scope_denied` with correlation metadata.

## 12. Rollout Plan

### Phase A
- schedule store contract,
- in-process executor,
- config + runtime APIs,
- segment/campaign target model and recipient fan-out execution,
- policy lifecycle integration,
- event emission.

### Phase B
- external queue executor adapter,
- stronger retry/claim-recovery hardening,
- high-concurrency execution controls.

### Phase C
- campaign governance hardening (audience estimation, throttling policies, and advanced guardrails).

## Sync Contract (Bi-Directional Alignment)

This RFC, `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`, and `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md` MUST remain aligned on:
1. command-first ordering.
2. flow-only router decision scope.
3. policy hooks apply to classic + flow + scheduled outputs.
4. `reply` required-by-default posture.
5. `onResponse` remains post-send/post-persist side effect.
6. HITL state visibility in response metadata.
7. scheduled source is first-class pipeline input with explicit source metadata.
8. campaign/broadcast segmentation is first-class scheduler capability.
9. scheduler control plane and agent tool plane remain split: segment targeting is unavailable to agent tools.
10. schedule claim/run and recipient fan-out execution rely on durable checkpoint/wait/outbox guarantees defined in `docs/rfcs/2026-02-28-durable-runtime-foundation-v0.1.md`.
