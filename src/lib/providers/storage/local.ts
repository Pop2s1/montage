import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getEnv } from "@/lib/config/env";
import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? getEnv().STORAGE_LOCAL_ROOT);
  }

  async ensureReady(): Promise<void> {
    for (const dir of ["uploads", "exports", "thumbnails", "temp"]) {
      await fs.mkdir(path.join(this.root, dir), { recursive: true });
    }
  }

  resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<string> {
    await this.ensureReady();
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  async putFromPath(key: string, sourcePath: string): Promise<string> {
    await this.ensureReady();
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.copyFile(sourcePath, full);
    return key;
  }

  async getBuffer(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // ignore missing
    }
  }

  async createUploadKey(projectId: string, filename: string): Promise<string> {
    const ext = path.extname(filename).toLowerCase() || ".mp4";
    const id = randomBytes(8).toString("hex");
    return path.join("uploads", projectId, `${Date.now()}-${id}${ext}`);
  }

  async createExportKey(projectId: string, exportId: string): Promise<string> {
    return path.join("exports", projectId, `${exportId}.mp4`);
  }

  absolutePath(key: string): string {
    return this.resolve(key);
  }
}

let storage: LocalStorageProvider | null = null;

export function getStorage(): LocalStorageProvider {
  if (!storage) storage = new LocalStorageProvider();
  return storage;
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}
