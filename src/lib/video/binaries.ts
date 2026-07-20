import { existsSync } from "fs";

let cachedFfmpeg: string | null = null;

/**
 * Resolve ffmpeg binary: system first, then ffmpeg-static (Vercel/serverless).
 */
export function getFfmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg;

  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    cachedFfmpeg = process.env.FFMPEG_PATH;
    return cachedFfmpeg;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const staticPath = require("ffmpeg-static") as string | null;
    if (staticPath && existsSync(staticPath)) {
      cachedFfmpeg = staticPath;
      return cachedFfmpeg;
    }
  } catch {
    // optional dependency
  }

  cachedFfmpeg = "ffmpeg";
  return cachedFfmpeg;
}

/** Prefer system ffprobe; fall back to ffmpeg binary for probing. */
export function getFfprobePath(): string {
  if (process.env.FFPROBE_PATH && existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  return "ffprobe";
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}
