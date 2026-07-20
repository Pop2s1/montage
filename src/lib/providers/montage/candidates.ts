import type { MontageInput } from "./types";
import type { MontageSegmentDraft, TranscriptWord } from "@/types/domain";
import { parseEditBrief, resolveTargetDuration, scoreTextAgainstBrief, type EditBrief } from "./brief";

export interface Candidate extends MontageSegmentDraft {
  words: TranscriptWord[];
}

/**
 * Build speech + illustration candidates, tightened to real speech and scored
 * against the user's editing brief.
 */
export function collectCandidates(input: MontageInput, brief?: EditBrief): Candidate[] {
  const b = brief ?? parseEditBrief(input);
  const out: Candidate[] = [];

  for (const video of input.videos) {
    const speechWindows = speechRanges(video.words, video.silences, video.durationSec, b);
    for (const win of speechWindows) {
      const tight = tightenToSpeech(video.words, win.start, win.end);
      const words = video.words.filter((w) => w.start >= tight.start - 0.02 && w.end <= tight.end + 0.05);
      const text = words.map((w) => w.word).join(" ").trim();
      if (!text || tight.end - tight.start < 1.0) continue;

      const themeBoost = scoreTextAgainstBrief(text, b);
      const interestBoost = video.interesting
        .filter((m) => overlaps(m.start, m.end, tight.start, tight.end))
        .reduce((acc, m) => acc + m.score, 0);

      // Prefer denser speech (less dead air inside the window)
      const spokenSpan =
        words.length > 1 ? words[words.length - 1]!.end - words[0]!.start : tight.end - tight.start;
      const density = spokenSpan / Math.max(0.1, tight.end - tight.start);

      out.push({
        videoId: video.id,
        sourceStartSec: round2(tight.start),
        sourceEndSec: round2(tight.end),
        spokenText: text,
        selectionReason:
          themeBoost > 0.25
            ? "Correspond à ta consigne"
            : b.intents.includes("remove_silence")
              ? "Passage parlé (silences retirés)"
              : "Passage parlé clair",
        relevanceScore: round2(
          0.35 + themeBoost * 0.45 + Math.min(0.2, interestBoost) + Math.min(0.12, density * 0.12),
        ),
        segmentType: "dialogue",
        words,
      });
    }

    for (let i = 0; i < video.scenes.length - 1; i++) {
      const start = video.scenes[i]!;
      const end = Math.min(start + 2.5, video.scenes[i + 1]!, video.durationSec);
      if (end - start < 1) continue;
      // Skip illustration if mostly silence and user asked to remove silence
      if (b.intents.includes("remove_silence")) {
        const silent = video.silences.some((s) => overlaps(s.start, s.end, start, end));
        if (silent) continue;
      }
      out.push({
        videoId: video.id,
        sourceStartSec: round2(start),
        sourceEndSec: round2(end),
        spokenText: undefined,
        selectionReason: "Plan d'illustration (changement de scène)",
        relevanceScore: b.wantBroll ? 0.42 : 0.32,
        segmentType: "illustration",
        words: [],
      });
    }
  }

  return out.sort((a, b2) => b2.relevanceScore - a.relevanceScore);
}

export function pickSegments(
  candidates: Candidate[],
  target: number,
  brief: EditBrief,
): MontageSegmentDraft[] {
  const dialogues = candidates.filter((c) => c.segmentType === "dialogue");
  const broll = candidates.filter((c) => c.segmentType === "illustration");

  const selected: MontageSegmentDraft[] = [];
  let used = 0;

  const hookDur = brief.pace === "fast" ? Math.min(5, target * 0.12) : Math.min(7, target * 0.16);
  const pace = brief.pace === "fast" ? 4.2 : brief.pace === "slow" ? 8 : 6;

  if (brief.wantHook && dialogues[0]) {
    const hook = trimTo(dialogues[0], hookDur);
    selected.push({
      ...strip(hook),
      segmentType: "introduction",
      selectionReason: "Accroche d'ouverture (consigne)",
      relevanceScore: Math.min(1, hook.relevanceScore + 0.15),
    });
    used += hook.sourceEndSec - hook.sourceStartSec;
  }

  let bi = 0;
  const bodyPool = brief.wantHook ? dialogues.slice(1) : dialogues;
  for (const c of bodyPool) {
    if (used >= target * 0.85) break;
    if (selected.some((s) => sameClip(s, c))) continue;
    const piece = trimTo(c, pace + (brief.pace === "slow" ? 2 : 1));
    const dur = piece.sourceEndSec - piece.sourceStartSec;
    if (used + dur > target) {
      const room = target - used;
      if (room < 1.4) break;
      selected.push(strip(trimTo(piece, room)));
      used = target;
      break;
    }
    selected.push(strip(piece));
    used += dur;

    if (brief.wantBroll && broll[bi] && used < target * 0.8) {
      const br = trimTo(broll[bi]!, brief.pace === "fast" ? 1.8 : 2.4);
      selected.push({ ...strip(br), segmentType: "illustration" });
      used += br.sourceEndSec - br.sourceStartSec;
      bi += 1;
    }
  }

  if (brief.wantCta || used < target) {
    const last = dialogues[dialogues.length - 1];
    if (last && used < target) {
      const cta = trimTo(last, Math.min(brief.pace === "fast" ? 4 : 5.5, target - used));
      if (!selected.some((s) => sameClip(s, cta))) {
        selected.push({
          ...strip(cta),
          segmentType: "conclusion",
          selectionReason: "Conclusion / CTA",
        });
      } else if (selected.length > 0) {
        selected[selected.length - 1]!.segmentType = "conclusion";
        selected[selected.length - 1]!.selectionReason = "Conclusion / CTA";
      }
    }
  }

  return selected.map((s) => ({ ...s, relevanceScore: round2(s.relevanceScore) }));
}

export function buildEditorial(input: MontageInput, segments: MontageSegmentDraft[], brief: EditBrief) {
  const tone = input.tone ?? "dynamique";
  const theme = brief.raw.slice(0, 80) || input.projectName;
  const hook =
    brief.intents.includes("emotional")
      ? "Un moment à retenir"
      : brief.intents.includes("promo")
        ? input.projectName
        : brief.intents.includes("tutorial")
          ? "À retenir"
          : "Ne manquez pas ça";

  const cta =
    brief.intents.includes("tutorial")
      ? "Enregistre pour plus tard"
      : brief.intents.includes("promo")
        ? "Découvre l'offre maintenant"
        : "Abonne-toi pour la suite";

  const hashtags = ["#montage", "#video", "#shorts", "#reels", "#ia", ...brief.keywords.slice(0, 3).map((k) => `#${k}`)];
  const spoken = segments
    .map((s) => s.spokenText)
    .filter(Boolean)
    .join(" ")
    .slice(0, 180);

  return {
    hook,
    cta,
    publishTitle: `${input.projectName} — ${tone}`,
    description: spoken || `Montage généré pour : ${theme}`,
    instagramCaption: `${hook}\n\n${spoken}\n\n${cta}\n\n${hashtags.join(" ")}`,
    youtubeDescription: `${input.projectName}\n\n${spoken}\n\n${cta}\n\n${hashtags.join(" ")}`,
    hashtags,
    coverText: hook,
    keywords: brief.keywords.slice(0, 8),
    midTitles: brief.intents.includes("highlights")
      ? ["Les temps forts", "Ce qu'il faut retenir"]
      : ["Le fil", "La suite"],
    variants: [`Version ${tone}`, "Version courte", "Version highlights"],
  };
}

export function toneToSubtitleStyle(tone?: string | null, brief?: EditBrief): string {
  if (brief?.intents.includes("energetic") || tone === "dynamique" || tone === "humoristique") {
    return "neon_pop";
  }
  if (brief?.intents.includes("emotional") || tone === "emotionnel") return "caption_box";
  if (tone === "professionnel") return "minimal_white";
  if (brief?.intents.includes("highlights")) return "karaoke_highlight";
  return "modern_bold";
}

export { parseEditBrief, resolveTargetDuration };

function speechRanges(
  words: TranscriptWord[],
  silences: { start: number; end: number }[],
  duration: number,
  brief: EditBrief,
): { start: number; end: number }[] {
  const maxWin = brief.pace === "fast" ? 5.5 : brief.pace === "slow" ? 10 : 8;
  const gapBreak = brief.intents.includes("remove_silence") ? 0.45 : 0.85;

  if (words.length === 0) {
    const ranges: { start: number; end: number }[] = [];
    let cursor = 0;
    const sorted = [...silences].sort((a, b) => a.start - b.start);
    for (const s of sorted) {
      if (s.start - cursor >= 1.5) ranges.push({ start: cursor, end: s.start });
      cursor = s.end;
    }
    if (duration - cursor >= 1.5) ranges.push({ start: cursor, end: duration });
    return ranges.slice(0, 12);
  }

  const ranges: { start: number; end: number }[] = [];
  let start = words[0]!.start;
  let prevEnd = words[0]!.end;

  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (w.start - prevEnd > gapBreak || w.end - start > maxWin) {
      ranges.push({ start, end: prevEnd });
      start = w.start;
    }
    prevEnd = w.end;
  }
  ranges.push({ start, end: prevEnd });
  return ranges.filter((r) => r.end - r.start >= 1.0);
}

/** Snap window to first/last spoken word to cut leading/trailing silence. */
function tightenToSpeech(
  words: TranscriptWord[],
  start: number,
  end: number,
): { start: number; end: number } {
  const inside = words.filter((w) => w.end > start && w.start < end);
  if (inside.length === 0) return { start, end };
  const s = Math.max(start, inside[0]!.start);
  const e = Math.min(end, inside[inside.length - 1]!.end);
  if (e - s < 0.8) return { start, end };
  // tiny pad so cuts don't feel abrupt
  return { start: Math.max(0, s - 0.05), end: e + 0.08 };
}

function trimTo(c: Candidate | MontageSegmentDraft, maxDur: number): Candidate {
  const dur = c.sourceEndSec - c.sourceStartSec;
  if (dur <= maxDur) return c as Candidate;
  const words = (c as Candidate).words ?? [];
  return {
    ...(c as Candidate),
    sourceEndSec: round2(c.sourceStartSec + maxDur),
    spokenText: words.length
      ? words
          .filter((w) => w.start >= c.sourceStartSec && w.end <= c.sourceStartSec + maxDur)
          .map((w) => w.word)
          .join(" ")
      : c.spokenText,
    words,
  };
}

function strip(c: Candidate | MontageSegmentDraft): MontageSegmentDraft {
  const { videoId, sourceStartSec, sourceEndSec, spokenText, selectionReason, relevanceScore, segmentType } =
    c;
  return {
    videoId,
    sourceStartSec,
    sourceEndSec,
    spokenText,
    selectionReason,
    relevanceScore,
    segmentType,
  };
}

function sameClip(a: MontageSegmentDraft, b: MontageSegmentDraft) {
  return (
    a.videoId === b.videoId &&
    Math.abs(a.sourceStartSec - b.sourceStartSec) < 0.3 &&
    Math.abs(a.sourceEndSec - b.sourceEndSec) < 0.3
  );
}

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && b0 < a1;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
