export interface SessionRecord {
  id           : string;
  userId       : string;
  startedAt    : Date;
  endedAt      : Date | null;
  summary      : string | null;
  messageCount : number;
  metadata     : Record<string, unknown>;
}
