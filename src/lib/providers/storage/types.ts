export interface StorageProvider {
  ensureReady(): Promise<void>;
  put(key: string, data: Buffer | Uint8Array): Promise<string>;
  putFromPath(key: string, sourcePath: string): Promise<string>;
  getBuffer(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  createUploadKey(projectId: string, filename: string): Promise<string>;
  createExportKey(projectId: string, exportId: string): Promise<string>;
  absolutePath(key: string): string;
}
