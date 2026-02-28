import { RuntimeResource } from "../lifecycle";

export interface FileStorage extends RuntimeResource {
  put(path: string, data: Buffer | string): Promise<string>;
  get(path: string): Promise<Buffer>;
}
