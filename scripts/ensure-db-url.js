/**
 * Ensure DATABASE_URL for Prisma CLI / app boot.
 * Neon on Vercel often provides POSTGRES_* names instead of DATABASE_URL.
 */
const allowPlaceholder = process.argv.includes("--allow-placeholder");

const candidates = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "STORAGE_DATABASE_URL",
  "NEON_DATABASE_URL",
];

if (!process.env.DATABASE_URL) {
  for (const key of candidates) {
    if (key === "DATABASE_URL") continue;
    if (process.env[key]) {
      process.env.DATABASE_URL = process.env[key];
      console.log(`[ensure-db-url] Using ${key} as DATABASE_URL`);
      break;
    }
  }
}

if (!process.env.DATABASE_URL && allowPlaceholder) {
  process.env.DATABASE_URL =
    "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";
  console.log("[ensure-db-url] Using placeholder DATABASE_URL for prisma generate only");
}

if (!process.env.DATABASE_URL) {
  console.error(`
[ensure-db-url] No database URL found.
Add DATABASE_URL, or connect Neon (provides POSTGRES_URL / POSTGRES_PRISMA_URL).
`);
  process.exit(1);
}
