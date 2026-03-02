import {
  FileStorage,
  LLMProvider,
  Logger,
  MessagingTransport,
  STTProvider,
  TTSProvider,
  VectorStore,
  DashboardProvider,
  ReactiveUiProvider,
  EventBus,
  Checkpointer,
  Ledger,
  DomainStore,
} from "../ports";
import { InboundMessage } from "../ports/transport";
import { RuntimeConfig } from "../config/types";
import { User } from "../entities/user";
import { ActiveSession, Session } from "../entities/session";
import { AgentLanguage } from "../entities/agent";
import { RuntimeResource } from "../lifecycle";

export type EngineNodeName =
  | "turn_setup"
  | "event_dedup_gate"
  | "access_policy"
  | "command_dispatch_gate"
  | "content_resolution"
  | "context_assembly"
  | "prompt_build"
  | "llm_node"
  | "tool_execution_node"
  | "response_finalize"
  | "interactive_streaming_node"
  | "persistence_hooks";

export type RouterNodeName = "identity_resolution" | "session_resolution";

export interface RuntimeContextMeta {
  requestId: string;
  startedAt: Date;
}

export interface RuntimeEngineContext<T = unknown> {
  meta: RuntimeContextMeta;
  config: RuntimeConfig<T>;
  inbound: InboundMessage;
  user?: User;
  session?: ActiveSession;
  transport: MessagingTransport;
  resources: RuntimeResourceSet;
  state: Record<string, unknown>;
  logger: Logger;
}

export interface RouterState {
  user?: User;
  session?: Session;
  inbound?: InboundMessage;
}

export interface RuntimeResourceSet {
  transport: MessagingTransport<unknown>;
  llm: LLMProvider;
  stt: STTProvider;
  tts: TTSProvider;
  storage: FileStorage;
  vectors: VectorStore;
  bus: EventBus;

  // Decoupled Persistence
  checkpointer: Checkpointer;
  ledger: Ledger;
  domainStore: DomainStore;

  /** Optional: streams system events to the built-in dashboard UI */
  dashboard?: DashboardProvider;
  /** Optional: WebSocket bridge for reactive UI clients (AG-UI / CopilotKit style) */
  reactiveUi?: ReactiveUiProvider;
  /** Optional: Autonomous logging sink */
  logger?: RuntimeResource;
}

export interface AgentContext<T = unknown> {
  user: User;
  session: ActiveSession;
  inbound: InboundMessage;
  language: AgentLanguage;
  replyTarget: string;
  resources: RuntimeResourceSet;
  config: RuntimeConfig<T>;
  endSession(): Promise<void>;
}
