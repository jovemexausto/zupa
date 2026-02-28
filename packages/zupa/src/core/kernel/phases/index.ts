import { RuntimeKernelContext, KernelPhaseName } from '../contracts';
import { accessPolicyPhase } from './accessPolicy';
import { agenticLoopPhase } from './agenticLoop';
import { commandDispatchGatePhase } from './commandDispatchGate';
import { contentResolutionPhase } from './contentResolution';
import { contextAssemblyPhase } from './contextAssembly';
import { persistenceHooksPhase } from './persistenceHooks';
import { promptBuildPhase } from './promptBuild';
import { responseFinalizePhase } from './responseFinalize';
import { sessionAttachPhase } from './sessionAttach';
import { telemetryEmitPhase } from './telemetryEmit';

export type RuntimePhaseHandler = (context: RuntimeKernelContext) => Promise<void>;
export type RuntimePhaseHandlerMap = Record<KernelPhaseName, RuntimePhaseHandler>;

export function buildDefaultKernelHandlers(): RuntimePhaseHandlerMap {
  // Map is declared in kernel order for scanability.
  // Each phase function includes its own contract/placeholder docs.
  return {
    access_policy         : accessPolicyPhase,
    session_attach        : sessionAttachPhase,
    command_dispatch_gate : commandDispatchGatePhase,
    content_resolution    : contentResolutionPhase,
    context_assembly      : contextAssemblyPhase,
    prompt_build          : promptBuildPhase,
    agentic_loop          : agenticLoopPhase,
    response_finalize     : responseFinalizePhase,
    persistence_hooks     : persistenceHooksPhase,
    telemetry_emit        : telemetryEmitPhase
  };
}
