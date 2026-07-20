import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { TranscriptionProvider, TranscriptionResult } from "./types";
import type { TranscriptWord } from "@/types/domain";

/**
 * Real Whisper via OpenAI Audio API when OPENAI_API_KEY is set.
 * Prefers a mono WAV extract; if FFmpeg is unavailable (e.g. some Vercel
 * runtimes), uploads the original media file directly.
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {}

  async transcribe(input: {
    filePath: string;
    language?: string;
    durationSec?: number;
  }): Promise<TranscriptionResult> {
    let uploadPath = input.filePath;
    let uploadName = path.basename(input.filePath) || "video.mp4";
    let uploadMime = guessMime(uploadName);
    let tempWav: string | null = null;

    try {
      tempWav = await extractWav(input.filePath);
      uploadPath = tempWav;
      uploadName = "audio.wav";
      uploadMime = "audio/wav";
    } catch (err) {
      console.warn("[transcription] wav extract failed, uploading source file", err);
    }

    try {
      const form = new FormData();
      const blob = new Blob([await fs.readFile(uploadPath)], { type: uploadMime });
      form.append("file", blob, uploadName);
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
      if (tempWav) await fs.unlink(tempWav).catch(() => undefined);
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
    p.on("error", (e) => reject(e));
  });
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "video/mp4";
}
