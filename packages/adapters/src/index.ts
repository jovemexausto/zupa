export * from './transport';
export * from './llm';
export * from './database';
export * from './storage';
export * from './vectors';
export * from './stt';
export * from './tts';
export * from './logger';
export * from './checkpoint';
export * from './reactive-ui';
export * from './bus';

/**
 * TODO: Conceptually distinguish between "plugin adapters" (user-facing) and "internal adapters" (system-level).
 * - Plugin adapters: Public interfaces intended for community or end-user implementation (e.g., LLM, Database).
 * - Internal adapters: Core infrastructure (e.g., Event Bus, Logger) that typically remain internal to the framework.
 */