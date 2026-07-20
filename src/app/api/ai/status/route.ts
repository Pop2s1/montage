import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { resolveTranscriptionDriverName } from "@/lib/providers/transcription";
import { resolveMontageDriverName } from "@/lib/providers/montage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Status of AI providers (no secrets).
 */
export async function GET() {
  try {
    const env = getEnv();
    const hasKey = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10);
    const transcription = resolveTranscriptionDriverName();
    const montage = resolveMontageDriverName();
    const smart = transcription === "openai" || montage === "openai";

    return NextResponse.json({
      ok: true,
      smartAiEnabled: smart,
      openaiKeyConfigured: hasKey,
      transcriptionProvider: transcription,
      montageProvider: montage,
      model: env.OPENAI_MONTAGE_MODEL,
      requested: {
        transcription: env.TRANSCRIPTION_PROVIDER,
        montage: env.MONTAGE_PROVIDER,
      },
      message: smart
        ? "IA active : Whisper comprend l'audio, GPT choisit les plans selon ta consigne (silences, rythme, accroche)."
        : "Mode démo (heuristiques). Ajoute OPENAI_API_KEY sur Vercel — avec TRANSCRIPTION_PROVIDER=auto et MONTAGE_PROVIDER=auto, l'IA s'active toute seule.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        smartAiEnabled: false,
        error: err instanceof Error ? err.message : "status unavailable",
      },
      { status: 500 },
    );
  }
}
