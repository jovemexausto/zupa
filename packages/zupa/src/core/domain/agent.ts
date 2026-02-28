import { SessionWithKV } from "../../capabilities/session/kv";
import { RuntimeKernelResources } from "../kernel";
import { InboundMessage } from "../ports/transport";
import { UserRecord } from "./models";

export const SUPPORTED_AGENT_LANGUAGES = [
  "auto", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt", "ru", "uk", "vi", "zh"
] as const;

export type AgentLanguage = typeof SUPPORTED_AGENT_LANGUAGES[number];

/**
 * This is the context passed to tools, commands, .onResponse and .context
 * This is a user/developer facing API, a simpler version RuntimeKernelContext, which is our internal context.
 * 
 */
export interface AgentContext {
  user        : UserRecord;
  session     : SessionWithKV;
  inbound     : InboundMessage;
  language    : AgentLanguage;
  replyTarget : string;
  resources   : RuntimeKernelResources
  //
  endSession(): Promise<void>;
}
