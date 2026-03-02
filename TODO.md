- [ ] How to reverse proxy (@zupa/api/src/middleware.ts and @zupa/api/src/sse-broadcaster.ts) as a single streamlined API? thats zupa api. What are the trade-offs and what it brings to the table? does we have better alternatives?Does it makes sense or I'm confusing boundaries?

- [ ] Can we move from 'ctx.resources.transport.sendText(...)' to something like 'ctx.reply(...)' for better dx maybe to auto route to the right place as we introduce 'reactive-ui' resources (deferred) if it makes sense. Let's analyze this.

- [ ] Redesign session summary and memory tier architecture (`endSessionWithKvHandoff` in `@zupa/core`) — currently tightly coupling LLM, domainStore, and KV. For v1, implement a two-tier model: (1) working memory (checkpoints) and (2) episodic memory (load last N session summaries from domainStore). Postpone semantic/vector memory. Summaries are LLM-generated based on the conversation, not a JSON stringification. We don't have 'sessionManager' abd it should be renamed to 'domainStore' for accuracy.

- [ ] Consolidate DomainStore session ending methods (`@zupa/core/src/ports/domain-store.ts`) — unify `endSession(sessionId, summary)` and `endSessionWithSummary(sessionId, endedAt, summary)` into a single method. This supports the v1 rolling summary retrieval strategy by standardizing how session history is persisted.

- [ ] RESOLVER // TODOs (Review / Refactoring)
- [ ] Revisar grafos e engine.
- [ ] Certificar features core funcionando
- [ ] Escrever e testar agentes ‘reais’.
- [ ] Interface integrada (builtin on the zupa package)
- [ ] Streamline zupa builtin API

<!-- DEFERRED -->

- [ ] Implement Phase 2 of Production Readiness RFC: Error taxonomy — classify Transient vs Terminal errors, apply `retryIdempotent` to LLM/Database/Transport calls accordingly.

- [ ] Implement Phase 2 of Production Readiness RFC: Circuit breaker per provider — fail fast during prolonged outages.

- [ ] Implement Phase 3 of Production Readiness RFC: Plumb correlation IDs (`requestId`, `sessionId`, `userId`, `eventId`) through `RuntimeEngineContext` and all telemetry/ledger events.

- [ ] Implement Phase 3 of Production Readiness RFC: Build Audit Ledger — immutable record of tool invocations, command dispatches, and `onResponse` events.

- [ ] We should define what is the expected SLA for the project and how we're going to measure it and how we going to track it.

- [ ] plan how to make horizontal scalability possible with multiple instances cordination (maybe using redis, or something else), etc. this also unlocks fault tolerance and recovery to be more robust. For wwebjs this will introduce a chanllange to handle multiple qrcodes, which leads us to other problemn: right now every agent ships with an ui/api (wip) but with multi instances we probably want/need a single UI/API instance for managing all replicas / agents. This also unlocks the multi qrcode problem. This is touch "Zupa Cloud" territory. Also, we're deciding to build upon wwebjs to gain velocity and make it easier to end users to run their own instances. This should be kubernetes ready and we should have also a 'control plane' deploy, which will be responsible for managing all replicas / agents with an amazing dashboard. We have a builtin dashboard, but in this case we need to provide a separate UI/API instance for managing multiple replicas / agents. Should builtin dashboard be disabled on this case? the control plane must be a single instance, right? How they connect?

- [ ] Consider a dedicated summarization instead of relying on the the checkpoint's message history rolling window.

<!-- END DEFERRED -->