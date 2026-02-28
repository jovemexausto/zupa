import { RuntimeResource } from "../runtime";

export interface VectorStorePort extends RuntimeResource {
  store(userId: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  search(userId: string, query: string, limit: number): Promise<Array<{ text: string; score: number }>>;
}