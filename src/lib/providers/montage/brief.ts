import type { MontageInput } from "./types";

export type EditPace = "fast" | "medium" | "slow";

export type EditIntent =
  | "hook"
  | "highlights"
  | "story"
  | "promo"
  | "tutorial"
  | "remove_silence"
  | "emotional"
  | "funny"
  | "energetic";

/**
 * Structured reading of the user's natural-language editing brief.
 * Heuristic (no API) — used by demo + OpenAI montage.
 */
export interface EditBrief {
  raw: string;
  keywords: string[];
  intents: EditIntent[];
  preferredDurationSec: number | null;
  mustInclude: string[];
  avoid: string[];
  pace: EditPace;
  wantBroll: boolean;
  wantHook: boolean;
  wantCta: boolean;
}

const STOP = new Set([
  "avec",
  "pour",
  "dans",
  "une",
  "des",
  "les",
  "que",
  "qui",
  "sur",
  "par",
  "pas",
  "plus",
  "mais",
  "donc",
  "alors",
  "cette",
  "cela",
  "faire",
  "fait",
  "montage",
  "video",
  "vidéo",
  "reel",
  "reels",
  "short",
  "shorts",
  "tiktok",
  "instagram",
  "youtube",
  "secondes",
  "seconde",
  "minutes",
  "minute",
  "version",
  "comme",
  "aussi",
  "bien",
  "très",
  "tout",
  "tous",
  "etre",
  "être",
  "avoir",
]);

export function parseEditBrief(input: Pick<MontageInput, "prompt" | "tone" | "targetDurationSec">): EditBrief {
  const raw = (input.prompt || "").trim();
  const lower = raw.toLowerCase();
  const keywords = tokenizeKeywords(raw);

  const intents: EditIntent[] = [];
  if (/accroche|hook|ouverture|premi[eè]res?\s*secondes|capte/.test(lower)) intents.push("hook");
  if (/meilleur|highlight|temps\s*fort|moment|essentiel|best/.test(lower)) intents.push("highlights");
  if (/histoire|story|raconte|narratif|storytelling/.test(lower)) intents.push("story");
  if (/promo|offre|vendre|call\s*to\s*action|cta|achat/.test(lower)) intents.push("promo");
  if (/tuto|apprendre|expliquer|educatif|éducatif|how\s*to/.test(lower)) intents.push("tutorial");
  if (/silence|coupe\s*les?\s*blancs|retire\s*les?\s*pauses|dynamise|serr[eé]/.test(lower)) {
    intents.push("remove_silence");
  }
  if (/emotion|émotion|touchant|sensible|intime/.test(lower)) intents.push("emotional");
  if (/humour|drole|drôle|funny|fun/.test(lower)) intents.push("funny");
  if (/energie|énergie|dynamique|rapide|punchy|vif/.test(lower)) intents.push("energetic");

  if (input.tone === "dynamique" || input.tone === "humoristique") intents.push("energetic");
  if (input.tone === "emotionnel") intents.push("emotional");
  if (input.tone === "promotionnel") intents.push("promo");
  if (input.tone === "educatif") intents.push("tutorial");
  if (input.tone === "storytelling") intents.push("story");

  const uniqueIntents = [...new Set(intents)];

  let pace: EditPace = "medium";
  if (
    uniqueIntents.includes("energetic") ||
    uniqueIntents.includes("remove_silence") ||
    /rapide|court|short|punch/.test(lower)
  ) {
    pace = "fast";
  } else if (uniqueIntents.includes("emotional") || uniqueIntents.includes("story") || /lent|posé|calme/.test(lower)) {
    pace = "slow";
  }

  const durationMatch = lower.match(/(\d{1,3})\s*(s|sec|secs|secondes?)/);
  const preferredDurationSec = durationMatch
    ? Math.max(10, Math.min(180, parseInt(durationMatch[1]!, 10)))
    : null;

  const mustInclude = extractQuoted(raw);
  const avoid = extractAvoid(lower);

  return {
    raw,
    keywords,
    intents: uniqueIntents,
    preferredDurationSec,
    mustInclude,
    avoid,
    pace,
    wantBroll:
      uniqueIntents.includes("story") ||
      uniqueIntents.includes("emotional") ||
      uniqueIntents.includes("energetic") ||
      /b-?roll|illustration|plan\s*coupe/.test(lower),
    wantHook: !/sans\s*accroche/.test(lower),
    wantCta: uniqueIntents.includes("promo") || /cta|abonne|like|suis-nous|découv/.test(lower),
  };
}

export function resolveTargetDuration(input: MontageInput, brief: EditBrief): number {
  const base = brief.preferredDurationSec ?? input.targetDurationSec ?? 45;
  return Math.max(12, Math.min(base, 120));
}

export function scoreTextAgainstBrief(text: string, brief: EditBrief): number {
  const lower = text.toLowerCase();
  if (!lower.trim()) return 0;

  let score = 0;
  const tokens = brief.keywords;
  if (tokens.length) {
    let hits = 0;
    for (const t of tokens) {
      if (lower.includes(t)) hits += 1;
    }
    score += hits / tokens.length;
  }

  for (const phrase of brief.mustInclude) {
    if (lower.includes(phrase.toLowerCase())) score += 0.35;
  }
  for (const phrase of brief.avoid) {
    if (lower.includes(phrase)) score -= 0.4;
  }

  if (brief.intents.includes("promo") && /offre|prix|maintenant|découv|lien/.test(lower)) score += 0.15;
  if (brief.intents.includes("tutorial") && /étape|astuce|comment|voici/.test(lower)) score += 0.12;
  if (brief.intents.includes("emotional") && /merci|amour|ensemble|ressens|cœur|coeur/.test(lower)) {
    score += 0.12;
  }

  return Math.max(0, Math.min(1.5, score));
}

function tokenizeKeywords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôùûüç0-9]+/i)
    .filter((t) => t.length > 3 && !STOP.has(t))
    .slice(0, 28);
}

function extractQuoted(prompt: string): string[] {
  const out: string[] = [];
  const re = /[«"“]([^»"”]+)[»"”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const v = m[1]!.trim();
    if (v.length > 1) out.push(v);
  }
  return out.slice(0, 6);
}

function extractAvoid(lower: string): string[] {
  const out: string[] = [];
  const m = lower.match(/(?:sans|éviter|eviter|pas\s+de)\s+([a-zàâäéèêëïîôùûüç0-9\s-]{3,40})/);
  if (m?.[1]) {
    out.push(
      ...m[1]
        .split(/[,et]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2)
        .slice(0, 4),
    );
  }
  return out;
}
