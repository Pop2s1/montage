import type { EditorialDraft, MontageSegmentDraft, TranscriptWord } from "@/types/domain";
import type { SilenceRange, InterestingMoment } from "@/types/domain";

export interface MontageInput {
  projectName: string;
  prompt: string;
  tone?: string | null;
  targetDurationSec: number;
  format: string;
  videos: Array<{
    id: string;
    durationSec: number;
    words: TranscriptWord[];
    silences: SilenceRange[];
    scenes: number[];
    interesting: InterestingMoment[];
  }>;
}

export interface MontageResult {
  segments: MontageSegmentDraft[];
  editorial: EditorialDraft;
  subtitleStyle: string;
}

export interface MontageProvider {
  readonly name: string;
  generate(input: MontageInput): Promise<MontageResult>;
}
