# RFC: Introducing `ctx.say()` DX Helper

## Status
- **Status**: Proposed
- **Author**: Antigravity
- **Date**: 2026-03-02

## Motivation
Simplifying outbound communication for tools, commands, and nodes. We want to distinguish between **Story Messages** (the primary assistant response) and **Side-channel Messages** (transient feedback).

## Core Semantics: Push Transport vs. Reactive Bridge

To clarify the responsibilities of each output channel, we define:

1.  **`PushTransport` (historically `MessagingTransport`)**: Optimized for discrete, fire-and-forget delivery to external chat networks (WhatsApp, Slack). Its primary unit is the `OutboundMessage`.
2.  **`ReactiveBridge` (historically `ReactiveUiProvider`)**: Optimized for continuous, bidirectional state-synchronization with a local UI. Its primary units are `StateDelta` and `TokenChunk`.

This distinction makes it clear: Zupa either "pushes" a bubble to a remote network OR "syncs" state to a local interface. We do not support simultaneous multi-channel eavesdropping.

## Proposed Changes

### 1. Update `AgentContext`
We will introduce `ctx.say()` as the primary method for sending messages to the user outside the canonical "story".

```typescript
export interface AgentContext<T = unknown> {
  // ... existing fields
  /**
   * Helper to send a transient, side-channel message back to the user.
   * Automatically uses the resolved replyTarget and routes to the active channel.
   * 
   * Note: These messages are NOT persisted to history.
   */
  say(message: string | Omit<OutboundMessage, "to">): Promise<void>;
}
```

### 2. Update Port Interfaces
We will add a dedicated method to the bridge to handle side-channel updates without overloading generic state deltas.

```typescript
// packages/core/src/ports/reactive-ui.ts
export interface ReactiveUiProvider extends RuntimeResource {
  // ...
  /** Emits a full side-channel message to a specific client */
  emitSideMessage(clientId: string, message: OutboundMessage): void;
}
```

### 3. Implementation & Routing Logic
The implementation routes the message to the **active** channel.

```typescript
async say(content: string | Omit<OutboundMessage, "to">) {
  const message: OutboundMessage = typeof content === "string" 
    ? { to: this.replyTarget, type: "text", body: content }
    : { to: this.replyTarget, ...content } as OutboundMessage;

  if (this.inbound.source === "ui_channel" && this.resources.reactiveUi) {
     // 1. Target the Bridge (Web UI)
     this.resources.reactiveUi.emitSideMessage(this.inbound.clientId!, message);
  } else {
     // 2. Target the Transport (WhatsApp/Slack)
     await this.resources.transport.sendMessage(message);
  }
}
```

## Architecture Constraints & Semantics

### Side-Channel by Design (No Persistence)
Messages sent via `ctx.say()` are explicitly **transient side-channel communications**.
- **No Persistence**: They are NOT saved to the `DomainStore` and are NOT added to the Checkpointer's `working memory`.
- **Why?**: This prevents IO overhead and avoids polluting the LLM's conversation history with system feedback or loading states.
- **Terminology**:
  - `ctx.say()`: The agent "speaks" outside the LLM turn (e.g. commands, alerts).
  - `turn result`: The canonical response that goes into the "story".

---

# Implementation Plan

This plan outlines the implementation of the `ctx.say()` helper for transient side-channel communication in Zupa.

## Proposed Changes

### [Component] `@zupa/core`

#### [MODIFY] [reactive-ui.ts](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/ports/reactive-ui.ts)
- Add `emitSideMessage(clientId: string, message: OutboundMessage): void` to the `ReactiveUiProvider` interface.

#### [MODIFY] [engine.ts](file:///Users/jovemexausto/Workspace/zupa/packages/core/src/contracts/engine.ts)
- Add `say(message: string | Omit<OutboundMessage, "to">): Promise<void>` to the `AgentContext` interface.

### [Component] `@zupa/adapters`

#### [MODIFY] [fake.ts](file:///Users/jovemexausto/Workspace/zupa/packages/adapters/src/reactive-ui/fake.ts)
- Implement `emitSideMessage` in `FakeReactiveUiProvider`.

### [Component] `@zupa/runtime`

#### [NEW] [context.ts](file:///Users/jovemexausto/Workspace/zupa/packages/runtime/src/utils/context.ts)
- Create a factory function `createAgentContext(turnContext: RuntimeEngineContext): AgentContext` to centralize the construction of the agent context and the implementation of `say()`.

#### [MODIFY] [nodes](file:///Users/jovemexausto/Workspace/zupa/packages/runtime/src/nodes/)
- Use `createAgentContext` helper in `responseFinalize.ts`, `interactiveStreamingNode.ts`, and `commandDispatchGate.ts`.

### [Component] Documentation

#### [NEW] [08-transient-side-channel-communication.md](file:///Users/jovemexausto/Workspace/zupa/docs/architecture/08-transient-side-channel-communication.md)
- Document the semantics of transient messages vs. persistent story messages.

## Verification Plan

### Automated Tests
- Add a test case in `packages/runtime/tests/agent-runtime-rejections.test.ts` (or equivalent) that uses `ctx.say()` from a command and verifies it reaches the transport/UI without being persisted.
- Verify that `ctx.say()` on a `ui_channel` turn calls `emitSideMessage`.
- Verify that `ctx.say()` on a `transport` turn calls `sendMessage`.

### Manual Verification
- Use `/help` or `/reset` in `english-buddy` (or any example) and verify they still work using the new `ctx.say()` under the hood.
