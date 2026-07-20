import type { TranscriptionProvider, TranscriptionResult } from "./types";
import type { TranscriptWord } from "@/types/domain";

/**
 * DEMO PROVIDER — no external API key required.
 * Generates a plausible timed transcript for pipeline testing.
 * Replace with Whisper/OpenAI via TRANSCRIPTION_PROVIDER=openai.
 */
export class DemoTranscriptionProvider implements TranscriptionProvider {
  readonly name = "demo";

  async transcribe(input: {
    filePath: string;
    language?: string;
    durationSec?: number;
  }): Promise<TranscriptionResult> {
    const duration = Math.max(8, input.durationSec ?? 30);
    const script = buildDemoScript(duration);
    const words = timingWords(script, duration);

    return {
      language: input.language ?? "fr",
      fullText: words.map((w) => w.word).join(" "),
      words,
      provider: this.name,
    };
  }
}

function buildDemoScript(durationSec: number): string[] {
  const base = [
    "Bienvenue",
    "sur",
    "notre",
    "événement",
    "aujourd'hui",
    "nous",
    "partageons",
    "les",
    "meilleurs",
    "moments",
    "avec",
    "vous",
    "l'énergie",
    "était",
    "incroyable",
    "regardons",
    "ensemble",
    "ce",
    "qui",
    "s'est",
    "passé",
    "merci",
    "à",
    "tous",
    "les",
    "participants",
    "abonnez-vous",
    "pour",
    "ne",
    "rien",
    "manquer",
    "et",
    "suivez-nous",
    "pour",
    "la",
    "suite",
  ];

  const count = Math.max(12, Math.floor(durationSec * 2.2));
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    words.push(base[i % base.length]!);
  }
  return words;
}

function timingWords(tokens: string[], durationSec: number): TranscriptWord[] {
  const gap = durationSec / tokens.length;
  const speechRatio = 0.75;
  return tokens.map((word, i) => {
    const start = i * gap;
    const end = start + gap * speechRatio;
    return { word, start: round2(start), end: round2(Math.min(durationSec, end)), confidence: 0.85 };
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
