import type { MontageInput, MontageProvider, MontageResult } from "./types";
import {
  buildEditorial,
  collectCandidates,
  parseEditBrief,
  pickSegments,
  resolveTargetDuration,
  toneToSubtitleStyle,
} from "./candidates";

/**
 * DEMO PROVIDER — heuristic montage without LLM.
 * Still brief-aware (silence trim, pacing, keyword score).
 */
export class DemoMontageProvider implements MontageProvider {
  readonly name = "demo";

  async generate(input: MontageInput): Promise<MontageResult> {
    const brief = parseEditBrief(input);
    const target = resolveTargetDuration(input, brief);
    const candidates = collectCandidates(input, brief);
    const selected = pickSegments(candidates, target, brief);

    return {
      segments: selected,
      editorial: buildEditorial(input, selected, brief),
      subtitleStyle: toneToSubtitleStyle(input.tone, brief),
    };
  }
}

/** Re-export for OpenAI provider / tests */
export { collectCandidates, parseEditBrief } from "./candidates";
