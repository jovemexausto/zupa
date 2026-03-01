import {
    FileStorage,
    LLMProvider,
    Logger,
    MessagingTransport,
    DatabaseProvider,
    STTProvider,
    TTSProvider,
    TelemetrySink,
    VectorStore,
    DashboardProvider,
    ReactiveUiProvider,
} from '../ports';
import { InboundMessage } from '../ports/transport';
import { RuntimeConfig } from '../config/types';
import { User } from '../entities/user';
import { ActiveSession, Session } from '../entities/session';
import { AgentLanguage } from '../entities/agent';

export type EngineNodeName =
    | 'turn_setup'
    | 'event_dedup_gate'
    | 'access_policy'
    | 'command_dispatch_gate'
    | 'content_resolution'
    | 'context_assembly'
    | 'prompt_build'
    | 'llm_node'
    | 'tool_execution_node'
    | 'response_finalize'
    | 'interactive_streaming_node'
    | 'persistence_hooks'
    | 'telemetry_emit';

export type RouterNodeName =
    | 'identity_resolution'
    | 'session_resolution';

export interface RuntimeContextMeta {
    requestId: string;
    startedAt: Date;
}

export interface RuntimeTelemetryContext {
    nodeDurationsMs: Partial<Record<EngineNodeName | RouterNodeName, number>>;
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

export interface RouterState {
    user?: User;
    session?: Session;
    inbound?: InboundMessage;
}

export interface RuntimeEngineResources {
    transport: MessagingTransport<unknown>;
    llm: LLMProvider;
    stt: STTProvider;
    tts: TTSProvider;
    storage: FileStorage;
    vectors: VectorStore;
    database: DatabaseProvider;
    telemetry: TelemetrySink;
    logger: Logger;
    /** Optional: streams system events to the built-in dashboard UI */
    dashboard?: DashboardProvider;
    /** Optional: WebSocket bridge for reactive UI clients (AG-UI / CopilotKit style) */
    reactiveUi?: ReactiveUiProvider;
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
