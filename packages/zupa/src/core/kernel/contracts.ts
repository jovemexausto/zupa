import type {
  FileStoragePort,
  InboundMessage,
  LLMProviderPort,
  MessagingTransportPort,
  RuntimeDatabasePort,
  STTProviderPort,
  TTSProviderPort,
  TelemetrySinkPort,
  VectorStorePort
} from '../ports';
import { RuntimeConfig } from '../runtime';

export type KernelPhaseName =
  | 'access_policy'
  | 'session_attach'
  | 'command_dispatch_gate'
  | 'content_resolution'
  | 'context_assembly'
  | 'prompt_build'
  | 'agentic_loop'
  | 'response_finalize'
  | 'persistence_hooks'
  | 'telemetry_emit';

export interface RuntimeContextMeta {
  requestId: string;
  startedAt: Date;
}

export interface RuntimeInboundContext extends InboundMessage { /**/ }

export interface RuntimeTelemetryContext {
  phaseDurationsMs: Partial<Record<KernelPhaseName, number>>;
}

export interface RuntimeKernelContext {
  meta      : RuntimeContextMeta;
  config    : RuntimeConfig;
  inbound   : RuntimeInboundContext;
  transport : MessagingTransportPort;
  resources : RuntimeKernelResources;
  state     : Record<string, unknown>;
  telemetry : RuntimeTelemetryContext;
}

export interface RuntimeKernelResources {
  transport  : MessagingTransportPort;
  llm        : LLMProviderPort;
  stt        : STTProviderPort;
  tts        : TTSProviderPort;
  storage    : FileStoragePort;
  vectors    : VectorStorePort;
  database   : RuntimeDatabasePort;
  telemetry  : TelemetrySinkPort;
}

export interface CreateInitialRuntimeContextInput {
  requestId       : string;
  startedAt       : Date;
  inbound         : RuntimeInboundContext;
  runtimeConfig   : RuntimeConfig;
  runtimeResources: RuntimeKernelResources;
}

export interface RuntimeKernelPhase {
  name: KernelPhaseName;
  run(context: RuntimeKernelContext): Promise<void>;
}

export interface RuntimeKernelPhaseHooks {
  onPhaseStart ?(event: { phase: KernelPhaseName; context: RuntimeKernelContext }): void;
  onPhaseEnd   ?(event: { phase: KernelPhaseName; context: RuntimeKernelContext; durationMs: number }): void;
  onPhaseError ?(event: { phase: KernelPhaseName; context: RuntimeKernelContext; error: unknown }): void;
}
