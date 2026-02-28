export interface TokensUsed {
  promptTokens     : number;
  completionTokens : number;
}

export interface Message {
  id             : string;
  sessionId      : string;
  userId         : string;
  role           : 'user' | 'assistant' | 'system' | 'tool';
  contentText    : string;
  inputModality  : 'text' | 'voice';
  outputModality : 'text' | 'voice';
  tokensUsed     : TokensUsed;
  latencyMs      : number;
  metadata       : Record<string, unknown>;
  createdAt      : Date;
}