import { getEnv } from "@/lib/config/env";
import type { MontageProvider } from "./types";
import { DemoMontageProvider } from "./demo";
import { OpenAIMontageProvider } from "./openai";

export function getMontageProvider(): MontageProvider {
  const driver = getEnv().MONTAGE_PROVIDER;
  if (driver === "openai") {
    if (!getEnv().OPENAI_API_KEY) {
      console.warn("[montage] OPENAI_API_KEY missing — falling back to demo");
      return new DemoMontageProvider();
    }
    return new OpenAIMontageProvider(getEnv().OPENAI_API_KEY!);
  }
  return new DemoMontageProvider();
}

export type { MontageProvider, MontageInput, MontageResult } from "./types";
