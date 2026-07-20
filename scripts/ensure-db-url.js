/**
 * Ensure DATABASE_URL is set for Prisma.
 * Vercel/Neon often injects POSTGRES_URL (or a custom prefix) instead of DATABASE_URL.
 */
const allowPlaceholder = process.argv.includes("--allow-placeholder");

const candidates = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_DATABASE_URL",
  "NEON_DATABASE_URL",
];

if (!process.env.DATABASE_URL) {
  for (const key of candidates) {
    if (key === "DATABASE_URL") continue;
    const value = process.env[key];
    if (value) {
      process.env.DATABASE_URL = value;
      console.log(`[ensure-db-url] Using ${key} as DATABASE_URL`);
      break;
    }
  }
}

if (!process.env.DATABASE_URL && allowPlaceholder) {
  process.env.DATABASE_URL = "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";
  console.log("[ensure-db-url] Using placeholder DATABASE_URL for prisma generate only");
}

if (!process.env.DATABASE_URL) {
  console.error(`
[ensure-db-url] DATABASE_URL is missing.

Fix in Vercel:
1. Open your project → Settings → Environment Variables
2. Add:
   Key:   DATABASE_URL
   Value: (your Neon connection string, starts with postgres:// or postgresql://)
3. Enable Production (+ Preview)
4. Redeploy

If Neon created another name (POSTGRES_URL, STORAGE_DATABASE_URL, …),
copy its value into a variable literally named DATABASE_URL.
`);
  process.exit(1);
}
