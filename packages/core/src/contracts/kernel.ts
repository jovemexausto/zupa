import {
    FileStoragePort,
    LLMProviderPort,
    MessagingTransportPort,
    RuntimeDatabasePort,
    STTProviderPort,
    TTSProviderPort,
    TelemetrySinkPort,
    VectorStorePort
} from '../ports';
import { InboundMessage } from '../ports/transport';
import { RuntimeConfig } from '../config/types';
import { UserRecord } from '../entities/user';
import { SessionWithKV } from '../entities/session';
import { AgentLanguage } from '../entities/agent';

export type KernelNodeName =
    | 'access_policy'
    | 'session_attach'
    | 'command_dispatch_gate'
    | 'content_resolution'
    | 'context_assembly'
    | 'prompt_build'
    | 'llm_node'
    | 'tool_execution_node'
    | 'response_finalize'
    | 'persistence_hooks'
    | 'telemetry_emit';

export interface RuntimeContextMeta {
    requestId: string;
    startedAt: Date;
}

export interface RuntimeTelemetryContext {
    nodeDurationsMs: Partial<Record<KernelNodeName, number>>;
}

export interface RuntimeKernelContext<T = unknown> {
    meta: RuntimeContextMeta;
    config: RuntimeConfig<T>;
    inbound: InboundMessage;
    user?: UserRecord;
    session?: SessionWithKV;
    transport: MessagingTransportPort;
    resources: RuntimeKernelResources;
    state: Record<string, unknown>;
    telemetry: RuntimeTelemetryContext;
}

export interface RuntimeKernelResources {
    transport: MessagingTransportPort;
    llm: LLMProviderPort;
    stt: STTProviderPort;
    tts: TTSProviderPort;
    storage: FileStoragePort;
    vectors: VectorStorePort;
    database: RuntimeDatabasePort;
    telemetry: TelemetrySinkPort;
}

export interface AgentContext<T = unknown> {
    user: UserRecord;
    session: SessionWithKV;
    inbound: InboundMessage;
    language: AgentLanguage;
    replyTarget: string;
    resources: RuntimeKernelResources;
    config: RuntimeConfig;
    endSession(): Promise<void>;
}
