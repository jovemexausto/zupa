import { type RuntimeResource } from '../lifecycle';

export interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStore extends RuntimeResource {
  upsert(userId: string, id: string, text: string, metadata?: object): Promise<void>;
  search(userId: string, query: string, limit: number): Promise<VectorSearchResult[]>;
  delete(userId: string, id: string): Promise<void>;
}