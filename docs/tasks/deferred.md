- [ ] Implement Phase 2 of Production Readiness RFC: Error taxonomy — classify Transient vs Terminal errors, apply `retryIdempotent` to LLM/Database/Transport calls accordingly.

- [ ] Implement Phase 2 of Production Readiness RFC: Circuit breaker per provider — fail fast during prolonged outages.

- [ ] Implement Phase 3 of Production Readiness RFC: Plumb correlation IDs (`requestId`, `sessionId`, `userId`, `eventId`) through `RuntimeEngineContext` and all telemetry/ledger events.

- [ ] Implement Phase 3 of Production Readiness RFC: Build Audit Ledger — immutable record of tool invocations, command dispatches, and `onResponse` events.

- [ ] We should define what is the expected SLA for the project and how we're going to measure it and how we going to track it.

- [ ] plan how to make horizontal scalability possible with multiple instances cordination (maybe using redis, or something else), etc. this also unlocks fault tolerance and recovery to be more robust. For wwebjs this will introduce a chanllange to handle multiple qrcodes, which leads us to other problemn: right now every agent ships with an ui/api (wip) but with multi instances we probably want/need a single UI/API instance for managing all replicas / agents. This also unlocks the multi qrcode problem. This is touch "Zupa Cloud" territory. Also, we're deciding to build upon wwebjs to gain velocity and make it easier to end users to run their own instances. This should be kubernetes ready and we should have also a 'control plane' deploy, which will be responsible for managing all replicas / agents with an amazing dashboard. We have a builtin dashboard, but in this case we need to provide a separate UI/API instance for managing multiple replicas / agents. Should builtin dashboard be disabled on this case? the control plane must be a single instance, right? How they connect?