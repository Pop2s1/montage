import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public-ish status of AI providers (no secrets).
 * Helps the UI explain demo vs real OpenAI editing.
 */
export async function GET() {
  try {
    const env = getEnv();
    const hasKey = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10);
    const transcription =
      env.TRANSCRIPTION_PROVIDER === "openai" && hasKey ? "openai" : "demo";
    const montage = env.MONTAGE_PROVIDER === "openai" && hasKey ? "openai" : "demo";
    const smart = transcription === "openai" || montage === "openai";

    return NextResponse.json({
      ok: true,
      smartAiEnabled: smart,
      openaiKeyConfigured: hasKey,
      transcriptionProvider: transcription,
      montageProvider: montage,
      requested: {
        transcription: env.TRANSCRIPTION_PROVIDER,
        montage: env.MONTAGE_PROVIDER,
      },
      message: smart
        ? "IA OpenAI active : transcription Whisper et/ou sélection de plans selon ta consigne."
        : "Mode démo : montage heuristique sans clé OpenAI. Pour un vrai montage IA, ajoute OPENAI_API_KEY, TRANSCRIPTION_PROVIDER=openai et MONTAGE_PROVIDER=openai sur Vercel.",
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
