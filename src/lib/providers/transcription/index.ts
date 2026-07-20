import { getEnv } from "@/lib/config/env";
import type { TranscriptionProvider } from "./types";
import { DemoTranscriptionProvider } from "./demo";
import { OpenAITranscriptionProvider } from "./openai";

export function getTranscriptionProvider(): TranscriptionProvider {
  const env = getEnv();
  const driver = resolveDriver(env.TRANSCRIPTION_PROVIDER, env.OPENAI_API_KEY);
  if (driver === "openai") {
    return new OpenAITranscriptionProvider(env.OPENAI_API_KEY!);
  }
  return new DemoTranscriptionProvider();
}

export function resolveTranscriptionDriverName(): "demo" | "openai" {
  const env = getEnv();
  return resolveDriver(env.TRANSCRIPTION_PROVIDER, env.OPENAI_API_KEY);
}

function resolveDriver(
  requested: "demo" | "openai" | "auto",
  apiKey?: string,
): "demo" | "openai" {
  const hasKey = Boolean(apiKey && apiKey.length > 10);
  if (requested === "openai") {
    if (!hasKey) {
      console.warn("[transcription] OPENAI_API_KEY missing — falling back to demo");
      return "demo";
    }
    return "openai";
  }
  if (requested === "auto") {
    return hasKey ? "openai" : "demo";
  }
  return "demo";
}

export type { TranscriptionProvider, TranscriptionResult } from "./types";
