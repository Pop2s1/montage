#!/usr/bin/env node
/**
 * Vercel / local production build.
 * Maps common Neon/Vercel Postgres env names to DATABASE_URL.
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

function firstEnv(keys) {
  for (const key of keys) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return null;
}

console.log("[build] Starting Montage build");
console.log(
  "[build] Env keys present:",
  [
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL_UNPOOLED",
    "AUTH_SECRET",
    "AUTH_TRUST_HOST",
  ]
    .map((k) => `${k}=${process.env[k] ? "yes" : "no"}`)
    .join(", "),
);

// Prisma Client prefers the pooled Prisma URL from Neon.
const runtimeUrl = firstEnv([
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
]);

// Migrations need a direct (non-pooling) connection when possible.
const migrateUrl = firstEnv([
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
]);

const placeholder = "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";

if (runtimeUrl) {
  process.env.DATABASE_URL = runtimeUrl.value;
  console.log(`[build] Runtime DATABASE_URL from ${runtimeUrl.key}`);
} else {
  console.warn("[build] No database URL found — using placeholder for prisma generate only");
  process.env.DATABASE_URL = placeholder;
}

run("prisma generate", "pnpm exec prisma generate");

if (migrateUrl) {
  run("prisma migrate deploy", "pnpm exec prisma migrate deploy", {
    ...process.env,
    DATABASE_URL: migrateUrl.value,
  });
  console.log(`[build] Migrated using ${migrateUrl.key}`);
} else {
  console.warn("[build] Skipping migrate (no database URL)");
}

run("next build", "pnpm exec next build");
console.log("\n[build] OK");
