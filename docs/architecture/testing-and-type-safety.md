# Architecture: Testing Utilities & 100% Type Safety

This document outlines the refactoring of testing utilities and the comprehensive effort to achieve 100% type safety across the Zupa monorepo.

## Overview

As the Zupa framework grew, testing boilerplate and the use of `any` in core contracts became a maintenance debt. We've introduced a centralized `@zupa/testing` package and hardened all internal types to ensure compile-time correctness and a premium developer experience.

## The `@zupa/testing` Package

We've extracted shared testing logic into a dedicated workspace package. This reduces duplication and provides a single source of truth for mock data and fakes.

### Standard Fixtures
- **`DEFAULT_USER`**: A standard `User` mockup.
- **`DEFAULT_SESSION`**: A standard `Session` mockup.
- **`DEFAULT_INBOUND`**: A standard `InboundMessage` mockup for simulating incoming traffic.

### Factories & Helpers
- **`createFakeRuntimeConfig(overrides)`**: Generates a full `RuntimeConfig` with sensible defaults.
- **`createFakeLLMResponse(overrides)`**: Simplifies LLM response mocking with structured data support.
- **`createFakeRuntimeDeps()`**: A one-stop-shop for a full suite of fake providers (LLM, Transport, DB, Storage, etc.).

## Type Safety Hardening

The project has transitioned to a "zero-any" policy in core logic.

### Core Contracts (`@zupa/core`)
- Interfaces like `NodeHandler`, `NodeResult`, and `CheckpointSaver` are now generic, allowing packages to define their internal state shapes without losing type information.
- `TelemetrySink` now includes mandatory fields like `timestamp`, removing ad-hoc casts.

### Pregel Executor (`@zupa/engine`)
- The `KernelExecutor` and `KernelGraphSpec` now use `object` constraints for state handling. This allows using interface types (like `RuntimeState`) directly without requiring index signatures (`Record<string, unknown>`), which previously forced developers to use `any`.

### Runtime nodes (`@zupa/runtime`)
- All runtime nodes are strictly typed through the `defineNode` helper.
- `AgentContext` bridges (e.g., in Tool Execution) are fully typed, ensuring that tool handlers receive validated input.

## Testing Best Practices

1. **Avoid `as any`**: Use the generic parameters of `defineNode` and `CheckpointSaver` to specify your types.
2. **Use Providers**: When testing components that need an OpenAI client, use the new dependency injection support in `OpenAILLMProvider`, `OpenAIWhisperSTTProvider`, and `OpenAITTSProvider`.
3. **Extend Fixtures**: Use the factory functions in `@zupa/testing` instead of creating incomplete objects and casting them.

---
*Date: 2026-02-28*
*Status: Implemented*
