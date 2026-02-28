export interface User {
  id: string;
  externalUserId: string;
  displayName: string;
  preferences: Record<string, unknown>;
  createdAt: Date;
  lastActiveAt: Date;
}