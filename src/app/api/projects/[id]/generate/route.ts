import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { enqueueJob } from "@/lib/queue/jobs";
import { kickQueue } from "@/lib/queue/inline";
import { waitUntil } from "@vercel/functions";
import { isVercelRuntime } from "@/lib/video/binaries";
import { resolveTranscriptionDriverName } from "@/lib/providers/transcription";
import { resolveMontageDriverName } from "@/lib/providers/montage";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Start (or restart) the full AI pipeline:
 * import → analyze → transcribe → generate timeline.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);

    const body = await req.json().catch(() => ({}));
    const promptFromBody = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (promptFromBody) {
      await prisma.project.update({
        where: { id },
        data: { prompt: promptFromBody },
      });
    }

    const project = await prisma.project.findUniqueOrThrow({ where: { id } });
    const prompt = (promptFromBody || project.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Écris d'abord une consigne de montage (ce que tu veux obtenir)." },
        { status: 400 },
      );
    }

    const videos = await prisma.videoAsset.findMany({ where: { projectId: id } });
    if (videos.length === 0) {
      return NextResponse.json({ error: "Importez au moins une vidéo" }, { status: 400 });
    }

    const transcriptionDriver = resolveTranscriptionDriverName();
    const montageDriver = resolveMontageDriverName();

    await prisma.processingJob.updateMany({
      where: { projectId: id, status: { in: ["pending", "running"] } },
      data: { status: "cancelled", finishedAt: new Date() },
    });

    let enqueued = 0;
    let needsUpstream = false;
    let refreshingTranscripts = 0;

    for (const video of videos) {
      const transcript = await prisma.transcript.findFirst({ where: { videoId: video.id } });
      const analysis = await prisma.videoAnalysis.findFirst({ where: { videoId: video.id } });

      if (video.status !== "ready" || !video.durationSec) {
        await enqueueJob({ projectId: id, type: "import", payload: { videoId: video.id } });
        enqueued += 1;
        needsUpstream = true;
      } else if (!analysis) {
        await enqueueJob({ projectId: id, type: "analyze", payload: { videoId: video.id } });
        enqueued += 1;
        needsUpstream = true;
      } else if (!transcript) {
        await enqueueJob({ projectId: id, type: "transcribe", payload: { videoId: video.id } });
        enqueued += 1;
        needsUpstream = true;
      } else if (transcriptionDriver === "openai" && transcript.provider !== "openai") {
        await enqueueJob({ projectId: id, type: "transcribe", payload: { videoId: video.id } });
        enqueued += 1;
        needsUpstream = true;
        refreshingTranscripts += 1;
      }
    }

    if (!needsUpstream) {
      await enqueueJob({ projectId: id, type: "generate", payload: {} });
      enqueued += 1;
    }

    await prisma.project.update({
      where: { id },
      data: {
        status: needsUpstream ? "analyzing" : "generating",
        errorMessage: null,
        prompt,
      },
    });

    const aiLabel =
      montageDriver === "openai" || transcriptionDriver === "openai"
        ? "IA OpenAI"
        : "mode démo";

    if (isVercelRuntime() || process.env.INLINE_WORKER === "1") {
      // Process a few jobs now so progress starts, then continue in background.
      // Avoid draining 20+ jobs inline (9 videos × Whisper) — that freezes the button UI.
      let drained = 0;
      try {
        drained = await kickQueue(6);
      } catch (err) {
        console.error("[generate] inline drain failed", err);
      }
      waitUntil(kickQueue(60));

      return NextResponse.json(
        {
          ok: true,
          enqueued,
          drained,
          needsUpstream,
          drivers: { transcription: transcriptionDriver, montage: montageDriver },
          message: `Pipeline ${aiLabel} démarré (${drained} étape(s) déjà faites). La suite continue automatiquement — regarde Progression.`,
        },
        { status: 202 },
      );
    }

    void kickQueue(40);

    return NextResponse.json(
      {
        ok: true,
        enqueued,
        needsUpstream,
        drivers: { transcription: transcriptionDriver, montage: montageDriver },
        message: needsUpstream
          ? refreshingTranscripts > 0
            ? `Transcription Whisper relancée (${refreshingTranscripts}), puis montage ${aiLabel}.`
            : `Analyse lancée (${aiLabel}). La génération suivra automatiquement.`
          : `Génération ${aiLabel} lancée. Suis la progression ci-dessous.`,
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Génération impossible";
    console.error("[generate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
