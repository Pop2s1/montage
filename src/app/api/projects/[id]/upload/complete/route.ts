import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
  originalName: z.string().min(1).max(260),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().optional(),
  videoId: z.string().min(1).optional(),
});

/**
 * Attach a Blob URL to an existing (prepare) video row, or create one.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`upload-complete:${user.id}`, 40, 60_000)) {
      return NextResponse.json({ error: "Trop d'uploads" }, { status: 429 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Métadonnées invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { url, pathname, originalName, sizeBytes, mimeType, videoId } = parsed.data;
    const storageKey = `blob:${url}`;

    let video =
      videoId != null
        ? await prisma.videoAsset.findFirst({ where: { id: videoId, projectId } })
        : null;

    if (video) {
      video = await prisma.videoAsset.update({
        where: { id: video.id },
        data: {
          storageKey,
          originalName,
          sizeBytes: sizeBytes || video.sizeBytes,
          mimeType: mimeType || video.mimeType,
          checksum: pathname,
          status: video.status === "ready" ? "ready" : "uploading",
        },
      });
    } else {
      const existing = await prisma.videoAsset.findFirst({
        where: { projectId, storageKey },
      });
      video = existing
        ? await prisma.videoAsset.update({
            where: { id: existing.id },
            data: {
              originalName,
              sizeBytes: sizeBytes || existing.sizeBytes,
              mimeType: mimeType || existing.mimeType,
              checksum: pathname,
              status: existing.status === "ready" ? "ready" : "uploading",
            },
          })
        : await prisma.videoAsset.create({
            data: {
              projectId,
              originalName,
              storageKey,
              mimeType: mimeType || guessMime(originalName),
              sizeBytes,
              status: "uploading",
              checksum: pathname,
            },
          });
    }

    const pendingJob = await prisma.processingJob.findFirst({
      where: {
        projectId,
        type: "import",
        status: { in: ["pending", "running", "completed"] },
        payloadJson: { contains: video.id },
      },
    });
    if (!pendingJob && video.status !== "ready") {
      await enqueueAndProcess({
        projectId,
        type: "import",
        payload: { videoId: video.id },
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    const videoCount = await prisma.videoAsset.count({ where: { projectId } });

    return NextResponse.json(
      { video, videoCount },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "complete failed";
    console.error("[upload/complete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  return "video/mp4";
}
