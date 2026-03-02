# RFC: Identity & Working Memory (The DomainStore Overreach)

**Date:** 2026-03-02
**Status:** PROPOSED

## 1. Introduction
During the recent Decoupled Persistence refactoring, the monolithic `database` was split into `Checkpointer` (Engine State), `Ledger` (Audit History), and `DomainStore` (Relational Data).

However, an audit of the runtime graph nodes reveals two critical areas where the framework still conceptually misuses the `DomainStore` to recover data that structurally belongs elsewhere:
1.  **Identity Resolution**: Guessing user display names because the `MessagingTransport` drops profile metadata.
2.  **Context Assembly**: Querying the relational database for conversation history instead of reading the immediate `Checkpointer` working memory.

This RFC proposes structural codebase changes to eliminate this "DomainStore overreach", restoring the runtime graph's independence and safety.

## 2. Flaw 1: The Identity Resolution Hallucination

### The Problem
Currently, in `packages/runtime/src/nodes/router/identityResolution.ts`, when a new user arrives via a Transport (e.g., WhatsApp `tel:551199`), the framework creates a user profile in the `DomainStore` with a hallucinated display name:

```typescript
// identityResolution.ts
displayName: externalUserId.split(':')[0] || 'Unknown User'
```

This occurs because the `InboundMessage` contract acts as an information bottleneck. Transports possess rich sender metadata (WhatsApp push names, Web UI session names), but they are forced to drop it before triggering the Engine.

### The Codebase Solution
1. **`@zupa/core/src/ports/transport.ts`**: Enrich the `InboundMessage` boundary interface.
   ```typescript
   export interface InboundMessage {
     messageId: string;
     from: string;
     body: string;
     source: 'transport' | 'ui_channel';
     // NEW: Optional, Transport-provided metadata
     senderProfile?: {
       displayName?: string;
     };
   }
   ```
2. **`@zupa/runtime/src/nodes/router/identityResolution.ts`**: Stop the hallucination. Use the profile or fallback gracefully.
   ```typescript
   user = await domainStore.createUser({
     externalUserId,
     displayName: inbound.senderProfile?.displayName || 'Anonymous User'
   });
   ```
3. **`@zupa/adapters`**: Update transports (e.g., `WWebJSTransport`, Webhooks) to map native sender payloads into `senderProfile`.

## 3. The Identity Update Pattern (Manual Overrides)

### The Problem
In many messaging bots (especially on WhatsApp), the initial **Transport Layer** provides a name (e.g., "John Doe" from the push name), but the agent might later ask: *"What is your preferred name?"*. 

The current system lacks a first-class way for a conversational flow to override the initial metadata provided by the Inbound Message.

### The Codebase Solution
1. **`@zupa/core/src/ports/domain-store.ts`**: Add a general update method.
   ```typescript
   export interface DomainStore {
     // ...
     /** Updates the user's basic profile (displayName) or behavioral preferences */
     updateUser(userId: string, data: { displayName?: string; preferences?: object }): Promise<void>;
   }
   ```
2. **First-Class Tooling**: Expose this to the LLM via a standard "Identity Management" tool. This allows the agent to self-correct its own persistent data when the user provides a correction:
   ```typescript
   // Example Tool Implementation
   {
     name: 'update_my_profile',
     description: 'Updates the user\'s display name in the system.',
     execute: async (args, ctx) => {
       await ctx.resources.domainStore.updateUser(ctx.user.id, { displayName: args.name });
     }
   }
   ```

## 4. Flaw 2: The Context Assembly Bypass

### The Problem
Currently, in `packages/runtime/src/nodes/contextAssembly.ts`, the framework fetches the immediate conversation history directly from the relational database:

```typescript
// contextAssembly.ts
const recentMessages = await resources.domainStore.getRecentMessages(
  session.id, 
  config.maxWorkingMemory || 20
);
```

This is fundamentally flawed for an agentic Reactor/Pregel architecture. The `Checkpointer` serves as the Engine's *Working Memory*. If the node must query the `DomainStore` asynchronously to figure out what was just said, we are:
*   Adding unnecessary I/O latency to the critical path.
*   Losing deterministic time-travel and replay capabilities.
*   Treating the Engine State as ephemeral rather than structurally complete.

The underlying fear was likely that appending every new message to `RuntimeState.history` would cause the checkpoint JSON blob to grow infinitely and crash Redis/KV stores.

### The Codebase Solution (Sliding Reducer)
We must shift the working memory into the Checkpointer while protecting against memory bloat using a sliding window reducer.

1. **`@zupa/runtime/src/nodes/index.ts`**: Declare history in the graph state.
   ```typescript
   export interface RuntimeState<TAgentState = KVStore> {
     // ... existing fields ...
     // NEW: Built-in working memory
     history?: Message[];
   }
   ```

2. **`@zupa/runtime/.../responseFinalize.ts`**: (or wherever `history` is mutated). Append the inbound message and the agent's response, slicing to a defined maximum length to prevent state bloat.
   ```typescript
   const currentHistory = state.history || [];
   const maxMemory = context.config.maxWorkingMemory || 20;
   
   const nextHistory = [...currentHistory, userMessage, agentMessage]
                         .slice(-maxMemory);

   return { stateDiff: { history: nextHistory }, nextTasks: [...] };
   ```

3. **`@zupa/runtime/src/nodes/contextAssembly.ts`**: Remove the `DomainStore` query completely.
   ```typescript
   const assembledContext = {
     history: state.history || [],
     summaries: recentSummaries // (Summaries might still come from Long-Term Memory / vectors)
   };
   ```

## 4. Architectural Summary
By implementing this RFC:
*   **The Transport** becomes solely responsible for external mapping and decoding perception metadata.
*   **The DomainStore** becomes a passive repository for business entities, unburdened by critical-path execution graph queries.
*   **The Checkpointer** becomes the true, deterministic, memory-safe snapshot of the conversation's active state.
