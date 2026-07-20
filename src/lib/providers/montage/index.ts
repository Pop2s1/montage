import { getEnv } from "@/lib/config/env";
import type { MontageProvider } from "./types";
import { DemoMontageProvider } from "./demo";
import { OpenAIMontageProvider } from "./openai";

/**
 * Resolve montage driver. `auto` = OpenAI when key present, else demo.
 */
export function getMontageProvider(): MontageProvider {
  const env = getEnv();
  const driver = resolveDriver(env.MONTAGE_PROVIDER, env.OPENAI_API_KEY);
  if (driver === "openai") {
    return new OpenAIMontageProvider(env.OPENAI_API_KEY!);
  }
  return new DemoMontageProvider();
}

export function resolveMontageDriverName(): "demo" | "openai" {
  const env = getEnv();
  return resolveDriver(env.MONTAGE_PROVIDER, env.OPENAI_API_KEY);
}

function resolveDriver(
  requested: "demo" | "openai" | "auto",
  apiKey?: string,
): "demo" | "openai" {
  const hasKey = Boolean(apiKey && apiKey.length > 10);
  if (requested === "openai") {
    if (!hasKey) {
      console.warn("[montage] OPENAI_API_KEY missing — falling back to demo");
      return "demo";
    }
    return "openai";
  }
  if (requested === "auto") {
    return hasKey ? "openai" : "demo";
  }
  return "demo";
}

export type { MontageProvider, MontageInput, MontageResult } from "./types";
