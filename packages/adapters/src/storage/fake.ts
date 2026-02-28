import { type FileStoragePort } from '@zupa/core';

export class FakeFileStorage implements FileStoragePort {
    private storage = new Map<string, Buffer>();

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }

    public async put(path: string, data: Buffer): Promise<string> {
        this.storage.set(path, data);
        return path;
    }

    public async get(path: string): Promise<Buffer> {
        const data = this.storage.get(path);
        if (!data) throw new Error(`File not found: ${path}`);
        return data;
    }

    public async delete(path: string): Promise<void> {
        this.storage.delete(path);
    }

    public async exists(path: string): Promise<boolean> {
        return this.storage.has(path);
    }
}
