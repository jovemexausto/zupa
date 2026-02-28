import { describe, expect, it } from 'vitest';
import { KERNEL_NODE_ORDER } from '@zupa/engine';

describe('Runtime Context and Contracts', () => {
  it('should have the correct kernel node order', () => {
    expect(KERNEL_NODE_ORDER).toEqual([
      'access_policy',
      'session_attach',
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
