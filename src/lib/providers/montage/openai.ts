import type { MontageInput, MontageProvider, MontageResult } from "./types";
import type { MontageSegmentDraft } from "@/types/domain";
import { DemoMontageProvider, collectCandidates } from "./demo";

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

/**
 * Uses OpenAI to pick real cuts from transcript candidates + write editorial copy.
 * Falls back to demo heuristics if the API fails or returns unusable data.
 */
export class OpenAIMontageProvider implements MontageProvider {
  readonly name = "openai";
  private fallback = new DemoMontageProvider();

  constructor(private apiKey: string) {}

  async generate(input: MontageInput): Promise<MontageResult> {
    const base = await this.fallback.generate(input);
    const pool = collectCandidates(input).slice(0, 40);

    if (pool.length === 0) return base;

    try {
      const candidates: CandidatePayload[] = pool.map((c, id) => ({
        id,
        videoId: c.videoId,
        start: c.sourceStartSec,
        end: c.sourceEndSec,
        text: (c.spokenText ?? "").slice(0, 280),
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
          model: "gpt-4o-mini",
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Tu es un monteur vidéo expert. À partir de la consigne utilisateur et de candidats de rushes horodatés, tu choisis les meilleurs plans pour un montage court vertical.

Réponds UNIQUEMENT en JSON:
{
  "selectedIds": number[],
  "segmentTypes": string[],
  "reasons": string[],
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

Règles:
- Respecte la consigne et le ton.
- Vise environ targetDurationSec (±20%).
- Priorise les passages dont le texte correspond à la consigne.
- Commence par une accroche (introduction), termine par une conclusion.
- selectedIds = ids candidats existants, ordre du montage, sans doublons inutiles.
- segmentTypes valeurs: introduction|dialogue|illustration|conclusion`,
            },
            {
              role: "user",
              content: JSON.stringify({
                prompt: input.prompt,
                tone: input.tone,
                projectName: input.projectName,
                targetDurationSec: input.targetDurationSec,
                format: input.format,
                candidates,
              }),
            },
          ],
        }),
      });

      if (!res.ok) {
        console.warn("[montage] OpenAI HTTP", res.status, await res.text());
        return base;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return base;

      const parsed = JSON.parse(content) as {
        selectedIds?: number[];
        segmentTypes?: string[];
        reasons?: string[];
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
      const selectedIds = (parsed.selectedIds ?? []).filter((id) => byId.has(id));
      if (selectedIds.length === 0) return base;

      const target = Math.max(15, Math.min(input.targetDurationSec || 45, 90));
      const segments: MontageSegmentDraft[] = [];
      let used = 0;
      const seen = new Set<string>();

      for (let i = 0; i < selectedIds.length; i++) {
        const id = selectedIds[i]!;
        const c = byId.get(id)!;
        const key = `${c.videoId}:${c.start}:${c.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (used >= target) break;

        let end = c.end;
        const dur = end - c.start;
        if (used + dur > target) {
          end = c.start + Math.max(1.5, target - used);
        }

        const type =
          sanitizeType(parsed.segmentTypes?.[i]) ||
          (i === 0
            ? "introduction"
            : i === selectedIds.length - 1
              ? "conclusion"
              : sanitizeType(c.type) || "dialogue");

        segments.push({
          videoId: c.videoId,
          sourceStartSec: round2(c.start),
          sourceEndSec: round2(end),
          spokenText: c.text || undefined,
          selectionReason: parsed.reasons?.[i] || "Choisi par l'IA selon ta consigne",
          relevanceScore: Math.min(1, c.score + 0.15),
          segmentType: type,
        });
        used = round2(used + (end - c.start));
      }

      if (segments.length === 0) return base;

      return {
        segments,
        editorial: {
          ...base.editorial,
          hook: parsed.hook ?? base.editorial.hook,
          cta: parsed.cta ?? base.editorial.cta,
          publishTitle: parsed.publishTitle ?? base.editorial.publishTitle,
          description: parsed.description ?? base.editorial.description,
          instagramCaption: parsed.instagramCaption ?? base.editorial.instagramCaption,
          youtubeDescription: parsed.youtubeDescription ?? base.editorial.youtubeDescription,
          hashtags: parsed.hashtags ?? base.editorial.hashtags,
          coverText: parsed.coverText ?? base.editorial.coverText,
          keywords: parsed.keywords ?? base.editorial.keywords,
          midTitles: parsed.midTitles ?? base.editorial.midTitles,
        },
        subtitleStyle: base.subtitleStyle,
      };
    } catch (err) {
      console.warn("[montage] OpenAI cut selection failed, using demo", err);
      return base;
    }
  }
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
