export interface User {
  id: string;
  externalUserId: string;
  displayName: string;
  preferences: {
    preferredReplyFormat?: 'text' | 'voice' | 'mirror' | 'dynamic';
    [key: string]: unknown;
  };
  createdAt: Date;
  lastActiveAt: Date;
}