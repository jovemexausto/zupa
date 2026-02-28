import type { CreateInitialRuntimeContextInput, KernelPhaseName, RuntimeKernelContext } from '../kernel';

export const KERNEL_PHASE_ORDER: readonly KernelPhaseName[] = [
  'access_policy',
  'session_attach',
  'command_dispatch_gate',
  'content_resolution',
  'context_assembly',
  'prompt_build',
  'agentic_loop',
  'response_finalize',
  'persistence_hooks',
  'telemetry_emit'
] as const;

export function createInitialRuntimeContext(input: CreateInitialRuntimeContextInput): RuntimeKernelContext {
  return {
    meta: {
      requestId: input.requestId,
      startedAt: input.startedAt
    },
    config: input.runtimeConfig,
    inbound: input.inbound,
    resources: input.runtimeResources,
    state: {},
    transport: input.runtimeResources.transport,
    telemetry: {
      phaseDurationsMs: {}
    }
  };
}
