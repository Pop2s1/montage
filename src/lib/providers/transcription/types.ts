import type { TranscriptWord } from "@/types/domain";

export interface TranscriptionResult {
  language: string;
  fullText: string;
  words: TranscriptWord[];
  provider: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: {
    filePath: string;
    language?: string;
    durationSec?: number;
  }): Promise<TranscriptionResult>;
}
