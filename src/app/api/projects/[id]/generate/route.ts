import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { enqueueJob } from "@/lib/queue/jobs";
import { kickQueue } from "@/lib/queue/inline";
import { waitUntil } from "@vercel/functions";
import { isVercelRuntime } from "@/lib/video/binaries";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Start (or restart) the full AI pipeline:
 * import → analyze → transcribe → generate timeline.
 *
 * Generate is only enqueued once videos are ready, or left to the
 * transcription step so it never races ahead of analysis.
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

    // Cancel active jobs then rebuild the pipeline
    await prisma.processingJob.updateMany({
      where: { projectId: id, status: { in: ["pending", "running"] } },
      data: { status: "cancelled", finishedAt: new Date() },
    });

    let enqueued = 0;
    let needsUpstream = false;

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
      }
    }

    // Only queue generate now if every video is already analyzed + transcribed.
    // Otherwise processTranscribeJob will enqueue generate when the chain finishes.
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

    if (isVercelRuntime() || process.env.INLINE_WORKER === "1") {
      waitUntil(kickQueue(40));
    } else {
      void kickQueue(40);
    }

    return NextResponse.json(
      {
        ok: true,
        enqueued,
        needsUpstream,
        message: needsUpstream
          ? "Analyse lancée. La génération démarrera automatiquement ensuite."
          : "Génération du montage lancée. Suis la progression ci-dessous.",
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
