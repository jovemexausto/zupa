export interface UserRecord {
  id             : string;
  externalUserId : string;
  displayName    : string;
  preferences    : Record<string, unknown>;
  createdAt      : Date;
  lastActiveAt   : Date;
}