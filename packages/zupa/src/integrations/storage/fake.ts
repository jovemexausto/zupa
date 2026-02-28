import type { FileStoragePort } from '../../core/ports';

export class FakeFileStorage implements FileStoragePort {
  private readonly bucket = new Map<string, Buffer>();

  public async put(path: string, data: Buffer | string): Promise<string> {
    const asBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.bucket.set(path, asBuffer);
    return path;
  }

  public async get(path: string): Promise<Buffer> {
    const data = this.bucket.get(path);
    if (!data) {
      throw new Error(`File not found: ${path}`);
    }

    return data;
  }
}
