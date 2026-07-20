import type { MontageInput, MontageProvider, MontageResult } from "./types";
import type { MontageSegmentDraft, TranscriptWord } from "@/types/domain";

/**
 * DEMO PROVIDER — deterministic heuristic montage without LLM.
 * Selects non-silent speech windows, builds hook + body + CTA.
 */
export class DemoMontageProvider implements MontageProvider {
  readonly name = "demo";

  async generate(input: MontageInput): Promise<MontageResult> {
    const target = Math.max(15, Math.min(input.targetDurationSec || 45, 90));
    const candidates = collectCandidates(input);
    const selected = pickSegments(candidates, target, input.tone);

    const editorial = buildEditorial(input, selected);

    return {
      segments: selected,
      editorial,
      subtitleStyle: toneToSubtitleStyle(input.tone),
    };
  }
}

interface Candidate extends MontageSegmentDraft {
  words: TranscriptWord[];
}

function collectCandidates(input: MontageInput): Candidate[] {
  const out: Candidate[] = [];

  for (const video of input.videos) {
    const speechWindows = speechRanges(video.words, video.silences, video.durationSec);
    for (const win of speechWindows) {
      const words = video.words.filter((w) => w.start >= win.start && w.end <= win.end + 0.05);
      const text = words.map((w) => w.word).join(" ").trim();
      if (!text || win.end - win.start < 1.2) continue;

      const themeBoost = scoreAgainstPrompt(text, input.prompt);
      const interestBoost = video.interesting
        .filter((m) => overlaps(m.start, m.end, win.start, win.end))
        .reduce((acc, m) => acc + m.score, 0);

      out.push({
        videoId: video.id,
        sourceStartSec: round2(win.start),
        sourceEndSec: round2(win.end),
        spokenText: text,
        selectionReason: themeBoost > 0.2 ? "Correspond au thème demandé" : "Passage parlé clair",
        relevanceScore: round2(0.45 + themeBoost * 0.4 + Math.min(0.25, interestBoost)),
        segmentType: "dialogue",
        words,
      });
    }

    // Illustration beats from scene cuts
    for (let i = 0; i < video.scenes.length - 1; i++) {
      const start = video.scenes[i]!;
      const end = Math.min(start + 2.5, video.scenes[i + 1]!, video.durationSec);
      if (end - start < 1) continue;
      out.push({
        videoId: video.id,
        sourceStartSec: round2(start),
        sourceEndSec: round2(end),
        spokenText: undefined,
        selectionReason: "Plan d'illustration (changement de scène)",
        relevanceScore: 0.35,
        segmentType: "illustration",
        words: [],
      });
    }
  }

  return out.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function speechRanges(
  words: TranscriptWord[],
  silences: { start: number; end: number }[],
  duration: number,
): { start: number; end: number }[] {
  if (words.length === 0) {
    // fallback: carve non-silent chunks
    const ranges: { start: number; end: number }[] = [];
    let cursor = 0;
    const sorted = [...silences].sort((a, b) => a.start - b.start);
    for (const s of sorted) {
      if (s.start - cursor >= 2) ranges.push({ start: cursor, end: s.start });
      cursor = s.end;
    }
    if (duration - cursor >= 2) ranges.push({ start: cursor, end: duration });
    return ranges.slice(0, 8);
  }

  const ranges: { start: number; end: number }[] = [];
  let start = words[0]!.start;
  let prevEnd = words[0]!.end;

  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (w.start - prevEnd > 0.85 || w.end - start > 8) {
      ranges.push({ start, end: prevEnd });
      start = w.start;
    }
    prevEnd = w.end;
  }
  ranges.push({ start, end: prevEnd });
  return ranges.filter((r) => r.end - r.start >= 1.2);
}

function pickSegments(
  candidates: Candidate[],
  target: number,
  tone?: string | null,
): MontageSegmentDraft[] {
  const dialogues = candidates.filter((c) => c.segmentType === "dialogue");
  const broll = candidates.filter((c) => c.segmentType === "illustration");

  const selected: MontageSegmentDraft[] = [];
  let used = 0;

  // Hook: best dialogue snippet (~first 4-6s)
  if (dialogues[0]) {
    const hook = trimTo(dialogues[0], Math.min(6, target * 0.15));
    selected.push({
      ...strip(hook),
      segmentType: "introduction",
      selectionReason: "Accroche d'ouverture",
      relevanceScore: Math.min(1, hook.relevanceScore + 0.15),
    });
    used += hook.sourceEndSec - hook.sourceStartSec;
  }

  const pace = tone === "dynamique" || tone === "humoristique" ? 4.5 : 7;
  const wantBroll = tone === "emotionnel" || tone === "storytelling" || tone === "dynamique";

  let bi = 0;
  for (const c of dialogues.slice(1)) {
    if (used >= target * 0.85) break;
    if (selected.some((s) => sameClip(s, c))) continue;
    const piece = trimTo(c, pace + 2);
    const dur = piece.sourceEndSec - piece.sourceStartSec;
    if (used + dur > target) {
      const room = target - used;
      if (room < 1.5) break;
      selected.push(strip(trimTo(piece, room)));
      used = target;
      break;
    }
    selected.push(strip(piece));
    used += dur;

    if (wantBroll && broll[bi] && used < target * 0.8) {
      const br = trimTo(broll[bi]!, 2.2);
      selected.push({
        ...strip(br),
        segmentType: "illustration",
      });
      used += br.sourceEndSec - br.sourceStartSec;
      bi++;
    }
  }

  // CTA / conclusion
  const last = dialogues[dialogues.length - 1];
  if (last && used < target) {
    const cta = trimTo(last, Math.min(5, target - used));
    if (!selected.some((s) => sameClip(s, cta))) {
      selected.push({
        ...strip(cta),
        segmentType: "conclusion",
        selectionReason: "Conclusion et appel à l'action",
      });
    } else if (selected.length > 0) {
      selected[selected.length - 1]!.segmentType = "conclusion";
      selected[selected.length - 1]!.selectionReason = "Conclusion et appel à l'action";
    }
  }

  // Assign timeline order only — positions computed later
  return selected.map((s) => ({ ...s, relevanceScore: round2(s.relevanceScore) }));
}

function trimTo(c: Candidate | MontageSegmentDraft, maxDur: number): Candidate {
  const dur = c.sourceEndSec - c.sourceStartSec;
  if (dur <= maxDur) return c as Candidate;
  return {
    ...(c as Candidate),
    sourceEndSec: round2(c.sourceStartSec + maxDur),
    spokenText: (c as Candidate).words
      ? (c as Candidate).words
          .filter((w) => w.start >= c.sourceStartSec && w.end <= c.sourceStartSec + maxDur)
          .map((w) => w.word)
          .join(" ")
      : c.spokenText,
    words: (c as Candidate).words ?? [],
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

function scoreAgainstPrompt(text: string, prompt: string): number {
  const tokens = tokenize(prompt);
  if (tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (lower.includes(t)) hits++;
  }
  return hits / tokens.length;
}

function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôùûüç0-9]+/i)
    .filter((t) => t.length > 3)
    .slice(0, 24);
}

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && b0 < a1;
}

function buildEditorial(input: MontageInput, segments: MontageSegmentDraft[]) {
  const tone = input.tone ?? "dynamique";
  const theme = input.prompt.slice(0, 80) || input.projectName;
  const hook =
    tone === "professionnel"
      ? input.projectName
      : tone === "emotionnel"
        ? "Un moment à retenir"
        : "Ne manquez pas ça";

  const cta =
    tone === "educatif"
      ? "Enregistrez pour plus tard"
      : tone === "promotionnel"
        ? "Découvrez l'offre maintenant"
        : "Abonnez-vous pour la suite";

  const hashtags = ["#montage", "#video", "#shorts", "#reels", "#ia"];
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
    instagramCaption: `${hook} ✨\n\n${spoken}\n\n${cta}\n\n${hashtags.join(" ")}`,
    youtubeDescription: `${input.projectName}\n\n${spoken}\n\n${cta}\n\n${hashtags.join(" ")}`,
    hashtags,
    coverText: hook,
    keywords: tokenize(input.prompt).slice(0, 8),
    midTitles: ["Les temps forts", "Ce qu'il faut retenir"],
    variants: [
      `Version ${tone}`,
      "Version courte",
      "Version avec plus d'illustrations",
    ],
  };
}

function toneToSubtitleStyle(tone?: string | null): string {
  switch (tone) {
    case "professionnel":
      return "minimal_white";
    case "humoristique":
    case "dynamique":
      return "neon_pop";
    case "emotionnel":
      return "caption_box";
    default:
      return "modern_bold";
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
