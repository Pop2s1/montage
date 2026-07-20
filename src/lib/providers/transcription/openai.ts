import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { TranscriptionProvider, TranscriptionResult } from "./types";
import type { TranscriptWord } from "@/types/domain";

/**
 * Real Whisper via OpenAI Audio API when OPENAI_API_KEY is set.
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {}

  async transcribe(input: {
    filePath: string;
    language?: string;
    durationSec?: number;
  }): Promise<TranscriptionResult> {
    // Extract mono wav for smaller upload when possible
    const wavPath = await extractWav(input.filePath);
    try {
      const form = new FormData();
      const blob = new Blob([await fs.readFile(wavPath)], { type: "audio/wav" });
      form.append("file", blob, "audio.wav");
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      if (input.language) form.append("language", input.language);

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI transcription failed: ${res.status} ${text}`);
      }

      const data = (await res.json()) as {
        text?: string;
        language?: string;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      const words: TranscriptWord[] = (data.words ?? []).map((w) => ({
        word: w.word.trim(),
        start: w.start,
        end: w.end,
        confidence: 0.9,
      }));

      return {
        language: data.language ?? input.language ?? "fr",
        fullText: data.text ?? words.map((w) => w.word).join(" "),
        words,
        provider: this.name,
      };
    } finally {
      await fs.unlink(wavPath).catch(() => undefined);
    }
  }
}

async function extractWav(videoPath: string): Promise<string> {
  const out = path.join(path.dirname(videoPath), `whisper-${Date.now()}.wav`);
  await runFfmpeg(["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", out]);
  return out;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-500)}`));
    });
  });
}
