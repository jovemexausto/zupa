import type { RuntimeKernelContext, RuntimeKernelPhase, RuntimeKernelPhaseHooks } from '../kernel';

interface RunKernelPhasesInput {
  context : RuntimeKernelContext;
  phases  : RuntimeKernelPhase[];
  hooks?  : RuntimeKernelPhaseHooks;
}

export async function runKernelPhases(input: RunKernelPhasesInput): Promise<RuntimeKernelContext> {
  const hooks = input.hooks;

  for (const phase of input.phases) {
    const phaseStartedAt = Date.now();
    hooks?.onPhaseStart?.({ phase: phase.name, context: input.context });

    try {
      await phase.run(input.context);
      const durationMs = Date.now() - phaseStartedAt;
      input.context.telemetry.phaseDurationsMs[phase.name] = durationMs;
      hooks?.onPhaseEnd?.({ phase: phase.name, context: input.context, durationMs });
    } catch (error) {
      hooks?.onPhaseError?.({ phase: phase.name, context: input.context, error });
      throw error;
    }
  }

  return input.context;
}
