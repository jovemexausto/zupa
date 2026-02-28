import type {
  KernelPhaseName,
  RuntimeInboundContext,
  RuntimeKernelContext,
  RuntimeKernelPhaseHooks,
  RuntimeKernelResources
} from '../kernel';
import type { RuntimeConfig } from '../runtime';
import { createInitialRuntimeContext, KERNEL_PHASE_ORDER } from './context';
import { runKernelPhases } from './runner';

export type KernelPhaseHandlers = Partial<Record<KernelPhaseName, (context: RuntimeKernelContext) => Promise<void>>>;

interface ExecuteKernelPipelineInput {
  runtimeConfig   : RuntimeConfig;
  runtimeResources: RuntimeKernelResources;
  inbound         : RuntimeInboundContext;
  hooks?          : RuntimeKernelPhaseHooks;
  handlers?       : KernelPhaseHandlers;
  requestId       : string;
  startedAt       : Date;
}

export async function executeKernelPipeline(input: ExecuteKernelPipelineInput): Promise<RuntimeKernelContext> {
  const phases = KERNEL_PHASE_ORDER.map((name) => ({
    name,
    run: async (ctx: RuntimeKernelContext) => {
      const handler = input.handlers?.[name];
      if ( !handler ) {
        return;
      }

      await handler(ctx);
    }
  }));

  const context = createInitialRuntimeContext(input);

  const runInput: {
    context: RuntimeKernelContext;
    phases: Array<{ name: KernelPhaseName; run: (ctx: RuntimeKernelContext) => Promise<void> }>;
    hooks?: RuntimeKernelPhaseHooks;
  } = {
    context,
    phases
  };
  if (input.hooks !== undefined) {
    runInput.hooks = input.hooks;
  }

  return runKernelPhases(runInput);
}
