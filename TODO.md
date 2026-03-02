- [ ] How to reverse proxy (@zupa/api/src/middleware.ts and @zupa/api/src/sse-broadcaster.ts) as a single streamlined API? thats zupa api. What are the trade-offs and what it brings to the table? does we have better alternatives?Does it makes sense or I'm confusing boundaries?

- [ ] Fix the 'Unknown User' problem.

- [ ] Move from 'ctx.resources.transport.sendText(...)' to something like 'ctx.reply(...)' for better dx maybe to auto route to the right place as we introduce 'reactive-ui' resources (deferred) if it makes sense.

- [ ] maybe we should introduce OutboundMedia and/or OutboundMessage ? (from @zupa/core/src/ports/transport.ts)

- [ ] Refactor rate limiting logic from commandDispatchGateNode (@zupa/runtime/src/nodes/commandDispatchGate.ts) — currently hardcoded for per-user rate limiting (rateLimitPerUserPerMinute), but this is not the best place to handle it. We already have createInboundConcurrencyLimiter for global concurrency limiting at the event bus level — consider extending it or creating a similar pattern for per-user rate limiting as a reusable middleware/reducer instead of hardcoding in the command gate.

- [ ] Redesign session summary and memory tier architecture (endSessionWithKvHandoff in @zupa/core) — currently tightly coupling LLM, domainStore, kv, and session manager. The three-tier memory model should be: (1) working memory (checkpoints/context window), (2) episodic memory (session summaries), (3) semantic memory (vector store for similarity-based retrieval). Consider introducing a dedicated summarization node to decouple concerns. Also clarify: should summaries be LLM-generated or just JSON stringification? Should summaries be retrievable by semantic similarity? Rename "sessionManager" parameter to something more accurate since it's actually calling domainStore.endSessionWithSummary.

- [x] Fix display name extraction in identityResolutionNode (@zupa/runtime/src/nodes/router/identityResolution.ts) — now uses `senderProfile.displayName` provided by the Transport layer.

- [ ] Consolidate DomainStore session ending methods (@zupa/core/src/ports/domain-store.ts) — we have both `endSession(sessionId, summary)` and `endSessionWithSummary(sessionId, endedAt, summary)`. The first is used in responseFinalize and other nodes for simple string summaries, while the second includes an explicit `endedAt` timestamp. These should be unified into a single method with optional timestamp handling, or the distinction should be clarified. This is part of the broader session summary and memory architecture redesign.
