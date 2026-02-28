import { describe, expect, it } from 'vitest';
import { ENGINE_NODE_ORDER } from '@zupa/engine';

describe('Runtime Context and Contracts', () => {
  it('should have the correct engine node order', () => {
    expect(ENGINE_NODE_ORDER).toEqual([
      'access_policy',
      'command_dispatch_gate',
      'content_resolution',
      'context_assembly',
      'prompt_build',
      'llm_node',
      'tool_execution_node',
      'response_finalize',
      'persistence_hooks',
      'telemetry_emit'
    ]);
  });
});
