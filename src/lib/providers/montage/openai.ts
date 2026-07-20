import type { MontageInput, MontageProvider, MontageResult } from "./types";
import type { MontageSegmentDraft } from "@/types/domain";
import { DemoMontageProvider } from "./demo";
import {
  buildEditorial,
  collectCandidates,
  parseEditBrief,
  resolveTargetDuration,
  toneToSubtitleStyle,
} from "./candidates";
import type { EditBrief } from "./brief";
import { getEnv } from "@/lib/config/env";

type CandidatePayload = {
  id: number;
  videoId: string;
  start: number;
  end: number;
  text: string;
  type: string;
  score: number;
  duration: number;
};

type LlmCut = {
  id: number;
  start?: number;
  end?: number;
  type?: string;
  reason?: string;
};

/**
 * OpenAI montage: understands the brief, picks real cuts from transcript
 * candidates, optionally trims in/out, writes editorial copy.
 */
export class OpenAIMontageProvider implements MontageProvider {
  readonly name = "openai";
  private fallback = new DemoMontageProvider();

  constructor(private apiKey: string) {}

  async generate(input: MontageInput): Promise<MontageResult> {
    const brief = parseEditBrief(input);
    const target = resolveTargetDuration(input, brief);
    const base = await this.fallback.generate(input);
    const pool = collectCandidates(input, brief).slice(0, 48);

    if (pool.length === 0) return base;

    try {
      const candidates: CandidatePayload[] = pool.map((c, id) => ({
        id,
        videoId: c.videoId,
        start: c.sourceStartSec,
        end: c.sourceEndSec,
        text: (c.spokenText ?? "").slice(0, 320),
        type: c.segmentType,
        score: c.relevanceScore,
        duration: round2(c.sourceEndSec - c.sourceStartSec),
      }));

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getEnv().OPENAI_MONTAGE_MODEL || "gpt-4o-mini",
          temperature: 0.25,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Tu es un monteur IA senior (style CapCut auto-cut + direction éditoriale).
Tu reçois une consigne utilisateur structurée + des candidats de rushes (texte horodaté).
Tu construis un montage vertical court, rythmé, fidèle à la consigne.

Réponds UNIQUEMENT en JSON:
{
  "planSummary": string,          // 1-2 phrases: ce que tu montes et pourquoi
  "cuts": [
    {
      "id": number,               // id candidat
      "start": number,            // optionnel, dans [candidat.start, candidat.end]
      "end": number,              // optionnel
      "type": "introduction"|"dialogue"|"illustration"|"conclusion"|"transition",
      "reason": string            // court, en français
    }
  ],
  "hook": string,
  "cta": string,
  "publishTitle": string,
  "description": string,
  "instagramCaption": string,
  "youtubeDescription": string,
  "hashtags": string[],
  "coverText": string,
  "keywords": string[],
  "midTitles": string[]
}

Règles de montage:
- Respecte STRICTEMENT la consigne (thème, ton, durée ~ targetDurationSec ±15%).
- Priorise les candidats dont le texte correspond aux mots-clés / mustInclude.
- Arc narratif: accroche → développement → conclusion/CTA si demandé.
- Si remove_silence / pace=fast: plans courts, pas de temps mort, coupe serré (start/end au plus près du texte).
- Si highlights: garde seulement les meilleurs passages, ignore le remplissage.
- Évite les doublons et les plans avoid[].
- cuts doit référencer des ids existants, ordre chronologique du montage (pas forcément de la source).
- 4 à 12 cuts selon la durée cible.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                projectName: input.projectName,
                format: input.format,
                tone: input.tone,
                targetDurationSec: target,
                brief: {
                  prompt: brief.raw,
                  keywords: brief.keywords,
                  intents: brief.intents,
                  pace: brief.pace,
                  mustInclude: brief.mustInclude,
                  avoid: brief.avoid,
                  wantHook: brief.wantHook,
                  wantCta: brief.wantCta,
                  wantBroll: brief.wantBroll,
                },
                candidates,
              }),
            },
          ],
        }),
      });

      if (!res.ok) {
        console.warn("[montage] OpenAI HTTP", res.status, await res.text());
        return annotate(base, brief, "fallback_demo_http");
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return annotate(base, brief, "fallback_demo_empty");

      const parsed = JSON.parse(content) as {
        planSummary?: string;
        cuts?: LlmCut[];
        hook?: string;
        cta?: string;
        publishTitle?: string;
        description?: string;
        instagramCaption?: string;
        youtubeDescription?: string;
        hashtags?: string[];
        coverText?: string;
        keywords?: string[];
        midTitles?: string[];
      };

      const byId = new Map(candidates.map((c) => [c.id, c]));
      const cuts = (parsed.cuts ?? []).filter((c) => byId.has(c.id));
      if (cuts.length === 0) return annotate(base, brief, "fallback_demo_no_cuts");

      const segments = assembleCuts(cuts, byId, target, brief, parsed.planSummary);
      if (segments.length === 0) return annotate(base, brief, "fallback_demo_assemble");

      const editorial = {
        ...buildEditorial(input, segments, brief),
        hook: parsed.hook ?? base.editorial.hook,
        cta: parsed.cta ?? base.editorial.cta,
        publishTitle: parsed.publishTitle ?? base.editorial.publishTitle,
        description:
          parsed.description ??
          (parsed.planSummary ? `${parsed.planSummary}\n\n${base.editorial.description}` : base.editorial.description),
        instagramCaption: parsed.instagramCaption ?? base.editorial.instagramCaption,
        youtubeDescription: parsed.youtubeDescription ?? base.editorial.youtubeDescription,
        hashtags: parsed.hashtags ?? base.editorial.hashtags,
        coverText: parsed.coverText ?? base.editorial.coverText,
        keywords: parsed.keywords ?? base.editorial.keywords,
        midTitles: parsed.midTitles ?? base.editorial.midTitles,
        variants: [
          parsed.planSummary ? `IA: ${parsed.planSummary.slice(0, 60)}` : "Version IA",
          ...base.editorial.variants,
        ],
      };

      return {
        segments,
        editorial,
        subtitleStyle: toneToSubtitleStyle(input.tone, brief),
      };
    } catch (err) {
      console.warn("[montage] OpenAI cut selection failed, using demo", err);
      return annotate(base, brief, "fallback_demo_error");
    }
  }
}

function assembleCuts(
  cuts: LlmCut[],
  byId: Map<number, CandidatePayload>,
  target: number,
  brief: EditBrief,
  planSummary?: string,
): MontageSegmentDraft[] {
  const segments: MontageSegmentDraft[] = [];
  let used = 0;
  const seen = new Set<string>();
  const pad = brief.pace === "fast" || brief.intents.includes("remove_silence") ? 0.02 : 0.08;

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i]!;
    const c = byId.get(cut.id)!;
    let start = typeof cut.start === "number" ? cut.start : c.start;
    let end = typeof cut.end === "number" ? cut.end : c.end;
    start = Math.max(c.start, Math.min(start, c.end - 0.5));
    end = Math.min(c.end, Math.max(end, start + 0.5));
    // Keep a tiny pad but never outside candidate
    start = round2(Math.max(c.start, start - pad));
    end = round2(Math.min(c.end, end + pad));

    const key = `${c.videoId}:${start.toFixed(2)}:${end.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (used >= target) break;

    let finalEnd = end;
    const dur = finalEnd - start;
    if (used + dur > target * 1.08) {
      finalEnd = start + Math.max(1.2, target - used);
      if (finalEnd <= start) break;
    }

    const type =
      sanitizeType(cut.type) ||
      (i === 0 && brief.wantHook
        ? "introduction"
        : i === cuts.length - 1 && brief.wantCta
          ? "conclusion"
          : sanitizeType(c.type) || "dialogue");

    const reason =
      cut.reason ||
      (planSummary ? `IA — ${planSummary.slice(0, 80)}` : "Choisi par l'IA selon ta consigne");

    segments.push({
      videoId: c.videoId,
      sourceStartSec: round2(start),
      sourceEndSec: round2(finalEnd),
      spokenText: c.text || undefined,
      selectionReason: reason,
      relevanceScore: Math.min(1, c.score + 0.2),
      segmentType: type,
    });
    used = round2(used + (finalEnd - start));
  }

  return segments;
}

function annotate(base: MontageResult, brief: EditBrief, tag: string): MontageResult {
  if (base.segments.length === 0) return base;
  return {
    ...base,
    editorial: {
      ...base.editorial,
      description: `${base.editorial.description}\n\n[${tag}] intents=${brief.intents.join(",") || "none"}`,
    },
  };
}

function sanitizeType(value?: string): MontageSegmentDraft["segmentType"] | null {
  const allowed = new Set(["introduction", "dialogue", "illustration", "conclusion", "transition", "broll"]);
  if (!value) return null;
  if (value === "broll") return "illustration";
  return allowed.has(value) ? (value as MontageSegmentDraft["segmentType"]) : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
