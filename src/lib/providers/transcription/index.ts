import { getEnv } from "@/lib/config/env";
import type { TranscriptionProvider } from "./types";
import { DemoTranscriptionProvider } from "./demo";
import { OpenAITranscriptionProvider } from "./openai";

export function getTranscriptionProvider(): TranscriptionProvider {
  const driver = getEnv().TRANSCRIPTION_PROVIDER;
  if (driver === "openai") {
    if (!getEnv().OPENAI_API_KEY) {
      console.warn("[transcription] OPENAI_API_KEY missing — falling back to demo");
      return new DemoTranscriptionProvider();
    }
    return new OpenAITranscriptionProvider(getEnv().OPENAI_API_KEY!);
  }
  return new DemoTranscriptionProvider();
}
