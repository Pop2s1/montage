import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./storage"),
  TRANSCRIPTION_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
  MONTAGE_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
  OPENAI_API_KEY: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().default(524_288_000),
  MAX_VIDEO_DURATION_SEC: z.coerce.number().default(1800),
  ALLOWED_VIDEO_MIME: z.string().default("video/mp4,video/webm,video/quicktime"),
  WORKER_POLL_MS: z.coerce.number().default(1500),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  DOWNLOAD_TOKEN_TTL_SEC: z.coerce.number().default(3600),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export function allowedMimeTypes(): string[] {
  return getEnv().ALLOWED_VIDEO_MIME.split(",").map((s) => s.trim()).filter(Boolean);
}
