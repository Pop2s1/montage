import type { MontageInput, MontageProvider, MontageResult } from "./types";
import { DemoMontageProvider } from "./demo";

/**
 * Uses OpenAI chat to refine segment selection; falls back to demo heuristics on failure.
 */
export class OpenAIMontageProvider implements MontageProvider {
  readonly name = "openai";
  private fallback = new DemoMontageProvider();

  constructor(private apiKey: string) {}

  async generate(input: MontageInput): Promise<MontageResult> {
    const base = await this.fallback.generate(input);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Tu es un monteur vidéo expert. Réponds en JSON avec {hook, cta, publishTitle, description, instagramCaption, youtubeDescription, hashtags:string[], coverText, keywords:string[], midTitles:string[]}.",
            },
            {
              role: "user",
              content: JSON.stringify({
                prompt: input.prompt,
                tone: input.tone,
                projectName: input.projectName,
                targetDurationSec: input.targetDurationSec,
                segments: base.segments.map((s) => ({
                  type: s.segmentType,
                  text: s.spokenText,
                  score: s.relevanceScore,
                })),
              }),
            },
          ],
        }),
      });

      if (!res.ok) return base;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return base;
      const parsed = JSON.parse(content) as Partial<MontageResult["editorial"]> & {
        hashtags?: string[];
      };

      return {
        ...base,
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
      };
    } catch (err) {
      console.warn("[montage] OpenAI refine failed, using demo", err);
      return base;
    }
  }
}
