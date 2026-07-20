import { describe, expect, it } from "vitest";
import { parseSilenceLog, parseSceneLog, buildAssSubtitles } from "@/lib/video/ffmpeg";
import { buildSubtitlesFromSegments } from "@/lib/services/subtitles";
import { DemoMontageProvider } from "@/lib/providers/montage/demo";
import { DemoTranscriptionProvider } from "@/lib/providers/transcription/demo";

describe("ffmpeg log parsers", () => {
  it("parses silence ranges", () => {
    const log = `
silence_start: 1.2
silence_end: 2.5 | silence_duration: 1.3
silence_start: 5.0
silence_end: 6.1
`;
    expect(parseSilenceLog(log)).toEqual([
      { start: 1.2, end: 2.5 },
      { start: 5.0, end: 6.1 },
    ]);
  });

  it("parses scene cuts", () => {
    const log = `pts_time:1.5\npts_time:3.2\npts_time:3.25`;
    expect(parseSceneLog(log)[0]).toBe(0);
    expect(parseSceneLog(log)).toContain(1.5);
    expect(parseSceneLog(log)).toContain(3.2);
  });
});

describe("subtitles", () => {
  it("builds cues from words", () => {
    const cues = buildSubtitlesFromSegments(
      [
        {
          timelineStartSec: 0,
          durationSec: 4,
          sourceStartSec: 10,
          videoId: "v1",
          spokenText: "bonjour le monde",
        },
      ],
      [
        {
          id: "v1",
          words: [
            { word: "bonjour", start: 10, end: 10.4 },
            { word: "le", start: 10.5, end: 10.7 },
            { word: "monde", start: 10.8, end: 11.2 },
          ],
        },
      ],
    );
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.text).toContain("bonjour");
    expect(cues[0]!.startSec).toBeGreaterThanOrEqual(0);
  });

  it("builds ASS content", () => {
    const ass = buildAssSubtitles(
      [{ startSec: 0, endSec: 2, text: "Hello" }],
      "modern_bold",
      1080,
      1920,
    );
    expect(ass).toContain("Dialogue:");
    expect(ass).toContain("Hello");
  });
});

describe("demo providers", () => {
  it("transcribes with timed words", async () => {
    const p = new DemoTranscriptionProvider();
    const r = await p.transcribe({ filePath: "/tmp/x.mp4", durationSec: 20 });
    expect(r.words.length).toBeGreaterThan(5);
    expect(r.fullText.length).toBeGreaterThan(5);
  });

  it("generates a montage under target duration", async () => {
    const p = new DemoMontageProvider();
    const words = Array.from({ length: 40 }).map((_, i) => ({
      word: i % 5 === 0 ? "événement" : `mot${i}`,
      start: i * 0.5,
      end: i * 0.5 + 0.35,
    }));
    const result = await p.generate({
      projectName: "Test",
      prompt: "Reel dynamique sur notre événement avec accroche",
      tone: "dynamique",
      targetDurationSec: 30,
      format: "instagram_reel",
      videos: [
        {
          id: "v1",
          durationSec: 30,
          words,
          silences: [{ start: 8, end: 9 }],
          scenes: [0, 5, 12, 20],
          interesting: [{ start: 5, end: 8, score: 0.8, reason: "cut" }],
        },
      ],
    });
    expect(result.segments.length).toBeGreaterThan(0);
    const total = result.segments.reduce((a, s) => a + (s.sourceEndSec - s.sourceStartSec), 0);
    expect(total).toBeLessThanOrEqual(35);
    expect(result.editorial.hook.length).toBeGreaterThan(0);
    expect(result.editorial.cta.length).toBeGreaterThan(0);
  });
});
