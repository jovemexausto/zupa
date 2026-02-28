import {
    FileStorage,
    LLMProvider,
    MessagingTransport,
    DatabaseProvider,
    STTProvider,
    TTSProvider,
    TelemetrySink,
    VectorStore
} from '../ports';
import { InboundMessage } from '../ports/transport';
import { RuntimeConfig } from '../config/types';
import { User } from '../entities/user';
import { ActiveSession } from '../entities/session';
import { AgentLanguage } from '../entities/agent';

export type EngineNodeName =
    | 'event_dedup_gate'
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
    nodeDurationsMs: Partial<Record<EngineNodeName, number>>;
}

export interface RuntimeEngineContext<T = unknown> {
    meta: RuntimeContextMeta;
    config: RuntimeConfig<T>;
    inbound: InboundMessage;
    user?: User;
    session?: ActiveSession;
    transport: MessagingTransport;
    resources: RuntimeEngineResources;
    state: Record<string, unknown>;
    telemetry: RuntimeTelemetryContext;
}

export interface RuntimeEngineResources {
    transport: MessagingTransport;
    llm: LLMProvider;
    stt: STTProvider;
    tts: TTSProvider;
    storage: FileStorage;
    vectors: VectorStore;
    database: DatabaseProvider;
    telemetry: TelemetrySink;
}

export interface AgentContext<T = unknown> {
    user: User;
    session: ActiveSession;
    inbound: InboundMessage;
    language: AgentLanguage;
    replyTarget: string;
    resources: RuntimeEngineResources;
    config: RuntimeConfig;
    endSession(): Promise<void>;
}
