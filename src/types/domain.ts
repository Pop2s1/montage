export const PROJECT_FORMATS = [
  "instagram_reel",
  "tiktok",
  "youtube_short",
  "youtube_horizontal",
  "custom",
] as const;

export type ProjectFormat = (typeof PROJECT_FORMATS)[number];

export const TONE_PRESETS = [
  "dynamique",
  "professionnel",
  "emotionnel",
  "humoristique",
  "educatif",
  "promotionnel",
  "storytelling",
] as const;

export type TonePreset = (typeof TONE_PRESETS)[number];

export const PROJECT_STATUSES = [
  "draft",
  "pending",
  "importing",
  "analyzing",
  "transcribing",
  "generating",
  "ready",
  "exporting",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const JOB_TYPES = ["import", "analyze", "transcribe", "generate", "export"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["pending", "running", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SEGMENT_TYPES = [
  "dialogue",
  "illustration",
  "introduction",
  "conclusion",
  "transition",
] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const SUBTITLE_STYLES = [
  "modern_bold",
  "minimal_white",
  "neon_pop",
  "caption_box",
  "karaoke_highlight",
] as const;
export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];

export interface FormatSpec {
  id: ProjectFormat;
  label: string;
  width: number;
  height: number;
  aspect: string;
}

export const FORMAT_SPECS: Record<ProjectFormat, FormatSpec> = {
  instagram_reel: {
    id: "instagram_reel",
    label: "Reel Instagram",
    width: 1080,
    height: 1920,
    aspect: "9:16",
  },
  tiktok: { id: "tiktok", label: "TikTok", width: 1080, height: 1920, aspect: "9:16" },
  youtube_short: {
    id: "youtube_short",
    label: "YouTube Short",
    width: 1080,
    height: 1920,
    aspect: "9:16",
  },
  youtube_horizontal: {
    id: "youtube_horizontal",
    label: "YouTube horizontal",
    width: 1920,
    height: 1080,
    aspect: "16:9",
  },
  custom: { id: "custom", label: "Personnalisé", width: 1080, height: 1920, aspect: "custom" },
};

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SilenceRange {
  start: number;
  end: number;
}

export interface InterestingMoment {
  start: number;
  end: number;
  score: number;
  reason: string;
}

export interface MontageSegmentDraft {
  videoId: string;
  sourceStartSec: number;
  sourceEndSec: number;
  spokenText?: string;
  selectionReason: string;
  relevanceScore: number;
  segmentType: SegmentType;
}

export interface EditorialDraft {
  hook: string;
  cta: string;
  publishTitle: string;
  description: string;
  instagramCaption: string;
  youtubeDescription: string;
  hashtags: string[];
  coverText: string;
  keywords: string[];
  midTitles: string[];
  variants: string[];
}
