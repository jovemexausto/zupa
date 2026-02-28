import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAgent } from '../src/api/createAgent';
import { createFakeRuntimeDeps } from '../src/testing/fakes';

const deps = createFakeRuntimeDeps();

const baseConfig = {
  prompt: 'hello',
  providers: {
    transport: deps.transport,
    llm: deps.llm,
    stt: deps.stt,
    tts: deps.tts,
    storage: deps.storage,
    vectors: deps.vectors,
    database: deps.database,
    telemetry: deps.telemetry
  }
};

describe('createAgent typing and surface', () => {
  it('creates an agent with explicit split dependencies', () => {
    const agent = createAgent(baseConfig);

    expect(typeof agent.start).toBe('function');
    expect(typeof agent.close).toBe('function');
    expect(typeof agent.on).toBe('function');
  });

  it('requires explicit infrastructure dependencies in config', () => {
    createAgent({
      ...baseConfig,
      // @ts-expect-error backends bundle is removed
      backends: {}
    });

    expect(true).toBe(true);
  });

  it('allows missing providers at type level for defaults-composer path', () => {
    createAgent({
      prompt: 'hello',
      providers: {
        transport: deps.transport,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database
      }
    });

    expect(true).toBe(true);
  });

  it('does not accept routing policy fields in config', () => {
    createAgent({
      ...baseConfig,
      // @ts-expect-error routing mode is removed from rewrite-only API
      routingMode: 'shadow'
    });

    createAgent({
      ...baseConfig,
      // @ts-expect-error rewriteMessageHandler is removed from rewrite-only API
      rewriteMessageHandler: async (_message: unknown) => {
        return;
      }
    });

    expect(true).toBe(true);
  });

  it('enforces reply field in output schema at compile time', () => {
    const requireReplySchema = <T extends { reply: string }>(_schema: z.ZodType<T>): boolean => true;
    expect(requireReplySchema(z.object({ reply: z.string() }))).toBe(true);
    // @ts-expect-error output schema must include reply: string
    requireReplySchema(z.object({ message: z.string() }));

    expect(true).toBe(true);
  });

  it('exposes full supported language union in dynamic prompt context typing', () => {
    createAgent({
      ...baseConfig,
      prompt: async (ctx) => {
        const language = ctx.language;
        return `Language: ${language}`;
      }
    });

    expect(true).toBe(true);
  });
});
