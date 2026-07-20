import type { TranscriptWord } from "@/types/domain";

export interface SubtitleCueDraft {
  startSec: number;
  endSec: number;
  text: string;
  words: TranscriptWord[];
}

/**
 * Build subtitle cues aligned to timeline segments using word-level timestamps.
 */
export function buildSubtitlesFromSegments(
  segments: Array<{
    timelineStartSec: number;
    durationSec: number;
    sourceStartSec: number;
    spokenText?: string | null;
    videoId: string;
  }>,
  transcripts: Array<{ id: string; words: TranscriptWord[] }>,
): SubtitleCueDraft[] {
  const byVideo = new Map(transcripts.map((t) => [t.id, t.words]));
  const cues: SubtitleCueDraft[] = [];

  for (const seg of segments) {
    const words = byVideo.get(seg.videoId) ?? [];
    const sourceEnd = seg.sourceStartSec + seg.durationSec;
    const inSeg = words.filter(
      (w) => w.start >= seg.sourceStartSec - 0.05 && w.end <= sourceEnd + 0.05,
    );

    if (inSeg.length === 0) {
      if (seg.spokenText?.trim()) {
        cues.push({
          startSec: round2(seg.timelineStartSec),
          endSec: round2(seg.timelineStartSec + Math.min(seg.durationSec, 3.5)),
          text: chunkText(seg.spokenText, 42),
          words: [],
        });
      }
      continue;
    }

    // Group into natural phrases (~2.5–3.5s or ~8 words)
    let buf: TranscriptWord[] = [];
    const flush = () => {
      if (!buf.length) return;
      const startOffset = buf[0]!.start - seg.sourceStartSec;
      const endOffset = buf[buf.length - 1]!.end - seg.sourceStartSec;
      const mappedWords = buf.map((w) => ({
        ...w,
        start: round2(seg.timelineStartSec + (w.start - seg.sourceStartSec)),
        end: round2(seg.timelineStartSec + (w.end - seg.sourceStartSec)),
      }));
      cues.push({
        startSec: round2(seg.timelineStartSec + Math.max(0, startOffset)),
        endSec: round2(seg.timelineStartSec + Math.max(startOffset + 0.4, endOffset)),
        text: buf.map((w) => w.word).join(" "),
        words: mappedWords,
      });
      buf = [];
    };

    for (const w of inSeg) {
      buf.push(w);
      const span = buf[buf.length - 1]!.end - buf[0]!.start;
      if (buf.length >= 8 || span >= 3.2) flush();
    }
    flush();
  }

  return cues;
}

function chunkText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const parts = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const p of parts) {
    if ((line + " " + p).trim().length > maxLen) {
      if (line) lines.push(line);
      line = p;
    } else {
      line = (line + " " + p).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).join("\n");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
