import { RuntimeResource } from "../runtime";

export interface FileStoragePort extends RuntimeResource {
  put(path: string, data: Buffer | string): Promise<string>;
  get(path: string): Promise<Buffer>;
}
