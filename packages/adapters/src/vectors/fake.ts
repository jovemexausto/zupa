import { type VectorStorePort } from '@zupa/core';

export class FakeVectorStore implements VectorStorePort {
    private readonly vectors = new Map<string, any[]>();

    public async upsert(userId: string, id: string, text: string, metadata?: object): Promise<void> {
        const userVectors = this.vectors.get(userId) ?? [];
        userVectors.push({ id, text, metadata });
        this.vectors.set(userId, userVectors);
    }

    public async search(userId: string, query: string, limit: number): Promise<any[]> {
        const userVectors = this.vectors.get(userId) ?? [];
        return userVectors.slice(-limit);
    }

    public async delete(userId: string, id: string): Promise<void> {
        const userVectors = this.vectors.get(userId) ?? [];
        this.vectors.set(userId, userVectors.filter((v) => v.id !== id));
    }
}
