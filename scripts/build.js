#!/usr/bin/env node
/**
 * Vercel / local production build.
 * Steps are logged clearly so Vercel build logs show the exact failure.
 */
const { execSync } = require("child_process");

function run(step, command, env = process.env) {
  console.log(`\n======== [build] ${step} ========`);
  console.log(`[build] $ ${command}\n`);
  try {
    execSync(command, { stdio: "inherit", env });
  } catch (err) {
    console.error(`\n[build] FAILED at step: ${step}`);
    throw err;
  }
}

function resolveDatabaseUrl() {
  const candidates = [
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_DATABASE_URL",
    "NEON_DATABASE_URL",
  ];

  if (process.env.DATABASE_URL) {
    return { key: "DATABASE_URL", value: process.env.DATABASE_URL };
  }

  for (const key of candidates) {
    if (key === "DATABASE_URL") continue;
    if (process.env[key]) {
      return { key, value: process.env[key] };
    }
  }
  return null;
}

console.log("[build] Starting Montage build");
console.log(
  "[build] Env keys present:",
  [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_DATABASE_URL",
    "NEON_DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_TRUST_HOST",
  ]
    .map((k) => `${k}=${process.env[k] ? "yes" : "no"}`)
    .join(", "),
);

const resolved = resolveDatabaseUrl();
const placeholder = "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";

if (resolved) {
  process.env.DATABASE_URL = resolved.value;
  console.log(`[build] Using ${resolved.key} as DATABASE_URL`);
} else {
  console.warn(`[build] No database URL found — prisma generate will use a placeholder.`);
  console.warn(`[build] Migrations will be SKIPPED. Add DATABASE_URL in Vercel settings.`);
  process.env.DATABASE_URL = placeholder;
}

run("prisma generate", "pnpm exec prisma generate");

if (resolved) {
  run("prisma migrate deploy", "pnpm exec prisma migrate deploy");
} else {
  console.warn("[build] Skipping prisma migrate deploy (no real DATABASE_URL)");
}

run("next build", "pnpm exec next build");

console.log("\n[build] OK");
