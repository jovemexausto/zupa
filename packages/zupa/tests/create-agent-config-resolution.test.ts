import { describe, expect, it } from 'vitest';

import { __private } from '../src/api/createAgent';
import { createFakeRuntimeDeps } from '../src/testing/fakes';

const baseDeps = createFakeRuntimeDeps();

const baseConfig = {
  prompt    : 'hello',
  providers : {
    llm       : baseDeps.llm,
    stt       : baseDeps.stt,
    tts       : baseDeps.tts,
    transport : baseDeps.transport,
    storage   : baseDeps.storage,
    vectors   : baseDeps.vectors,
    database  : baseDeps.database
  }
};

describe('createAgent config resolution', () => {
  it('keeps explicit runtime dependencies and resolves language', () => {
    const resolved = __private.resolveRuntimeConfig(baseConfig);

    expect(resolved.prompt).toBe('hello');
    expect(resolved.language).toBe('en');
    expect(resolved.maxToolIterations).toBe(3);
    expect(resolved.maxWorkingMemory).toBe(20);
    expect(resolved.maxEpisodicMemory).toBe(3);
    expect(resolved.semanticSearchLimit).toBe(3);
    expect(resolved.rateLimitPerUserPerMinute).toBe(20);
    expect(resolved.ttsVoice).toBe('alloy');
    expect(resolved.audioStoragePath).toBe('./data/audio');
    expect(resolved.toolTimeoutMs).toBe(12_000);
    expect(resolved.llmTimeoutMs).toBe(20_000);
    expect(resolved.sttTimeoutMs).toBe(15_000);
    expect(resolved.ttsTimeoutMs).toBe(15_000);
    expect((resolved as unknown as { maxIdempotentRetries?: number }).maxIdempotentRetries).toBe(2);
    expect((resolved as unknown as { retryBaseDelayMs?: number }).retryBaseDelayMs).toBe(75);
    expect((resolved as unknown as { retryJitterMs?: number }).retryJitterMs).toBe(25);
    expect((resolved as unknown as { maxInboundConcurrency?: number }).maxInboundConcurrency).toBe(32);
    expect((resolved as unknown as { overloadMessage?: string }).overloadMessage).toContain('busy');
    expect((resolved as unknown as { sessionIdleTimeoutMinutes?: number }).sessionIdleTimeoutMinutes).toBe(30);
    expect((resolved as unknown as { ui?: { enabled?: boolean; host?: string; port?: number; sseHeartbeatMs?: number } }).ui).toEqual({
      enabled: true,
      host: '127.0.0.1',
      port: 4200,
      sseHeartbeatMs: 15_000
    });
    expect(resolved.singleUser).toBeUndefined();
    expect(resolved.welcomeMessage).toBeUndefined();
    expect(resolved.fallbackReply).toContain('temporary issue');
    expect(Object.prototype.hasOwnProperty.call(resolved, 'llm')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(resolved, 'stt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(resolved, 'tts')).toBe(false);
  });

  it('keeps optional singleUser when provided', () => {
    const resolved = __private.resolveRuntimeConfig({
      ...baseConfig,
      singleUser: '+15550000000'
    });

    expect(resolved.singleUser).toBe('+15550000000');
  });

  it('disables ui when ui is false', () => {
    const resolved = __private.resolveRuntimeConfig({
      ...baseConfig,
      ui: false
    });

    expect((resolved as unknown as { ui?: { enabled?: boolean } }).ui).toEqual({ enabled: false });
  });

  it('accepts language override and normalizes compatible forms', () => {
    const spanish = __private.resolveRuntimeConfig({
      ...baseConfig,
      language: 'es'
    });
    expect(spanish.language).toBe('es');

    const brazilian = __private.resolveRuntimeConfig({
      ...baseConfig,
      language: 'pt_BR'
    });
    expect(brazilian.language).toBe('pt');
  });

  it('throws for reserved auto and unsupported language codes', () => {
    expect(() =>
      __private.resolveRuntimeConfig({
        ...baseConfig,
        language: 'auto'
      })
    ).toThrowError("Invalid agent config: language 'auto' is reserved but not supported yet.");

    expect(() =>
      __private.resolveRuntimeConfig({
        ...baseConfig,
        language: 'zz'
      })
    ).toThrowError('Invalid agent config: unsupported language "zz".');
  });

  it('throws clear error when required runtime config fields are missing', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: '',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback'
      })
    ).toThrowError('Invalid agent config: missing prompt');
  });

  it('throws for invalid runtime integer bounds', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 0,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        toolTimeoutMs: 0,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback'
      })
    ).toThrowError('Invalid agent config: invalid maxToolIterations, toolTimeoutMs');
  });

  it('throws when required runtime resources are missing', () => {
    const resources = __private.validateRuntimeResources(baseConfig.providers);
    const broken = { ...resources, transport: undefined as never };

    expect(() =>
      __private.validateRuntimeResources(broken)
    ).toThrowError('Invalid agent config: missing transport');
  });

  it('throws for invalid retry policy bounds', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: -1 as never,
        retryBaseDelayMs: 0 as never,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback'
      } as never)
    ).toThrowError(/Invalid agent config: invalid .*maxIdempotentRetries.*retryBaseDelayMs|Invalid agent config: invalid .*retryBaseDelayMs.*maxIdempotentRetries/);
  });

  it('throws for invalid inbound backpressure bounds', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 0 as never,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback'
      } as never)
    ).toThrowError('Invalid agent config: invalid maxInboundConcurrency');
  });

  it('throws for invalid session idle timeout bounds', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        sessionIdleTimeoutMinutes: 0 as never,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback'
      } as never)
    ).toThrowError('Invalid agent config: invalid sessionIdleTimeoutMinutes');
  });

  it('throws when non-loopback ui host is configured without auth token', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback',
        ui: {
          enabled: true,
          host: '0.0.0.0',
          port: 4200,
          sseHeartbeatMs: 15_000
        }
      } as never)
    ).toThrowError('Invalid agent config: ui.authToken is required for non-loopback ui.host');
  });

  it('allows loopback ui host without auth token', () => {
    expect(() =>
      __private.validateRuntimeConfig({
        prompt: 'hello',
        language: 'en',
        maxToolIterations: 3,
        maxWorkingMemory: 20,
        maxEpisodicMemory: 3,
        semanticSearchLimit: 3,
        rateLimitPerUserPerMinute: 20,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 75,
        retryJitterMs: 25,
        maxInboundConcurrency: 32,
        toolTimeoutMs: 12_000,
        llmTimeoutMs: 20_000,
        sttTimeoutMs: 15_000,
        ttsTimeoutMs: 15_000,
        overloadMessage: 'busy',
        ttsVoice: 'alloy',
        audioStoragePath: './data/audio',
        fallbackReply: 'fallback',
        ui: {
          enabled: true,
          host: '127.0.0.1',
          port: 4200,
          sseHeartbeatMs: 15_000
        }
      } as never)
    ).not.toThrow();
  });
});
