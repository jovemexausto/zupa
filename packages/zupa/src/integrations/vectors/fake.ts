import type { VectorStorePort } from '../../core/ports';

export class FakeVectorStore implements VectorStorePort {
  private readonly records: Array<{ userId: string; text: string; metadata: Record<string, unknown> }> = [];

  public async store(userId: string, text: string, metadata: Record<string, unknown>): Promise<void> {
    this.records.push({ userId, text, metadata });
  }

  public async search(userId: string, query: string, limit: number): Promise<Array<{ text: string; score: number }>> {
    const filtered = this.records
      .filter((record) => record.userId === userId)
      .filter((record) => record.text.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);

    return filtered.map((record) => ({ text: record.text, score: 1 }));
  }
}
