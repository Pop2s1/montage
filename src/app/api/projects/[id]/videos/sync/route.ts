import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const itemSchema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1).optional(),
  originalName: z.string().min(1).max(260),
  sizeBytes: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
});

const bodySchema = z.object({
  videos: z.array(itemSchema).min(1).max(40),
});

/**
 * Re-register Blob videos into the project DB.
 * Used when the UI showed uploads but video_assets rows are missing.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`videos-sync:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const upserted = [];

    for (const item of parsed.data.videos) {
      const storageKey = item.url.startsWith("blob:") ? item.url : `blob:${item.url}`;
      const existing = await prisma.videoAsset.findFirst({
        where: { projectId, storageKey },
      });

      if (existing) {
        upserted.push(existing);
        continue;
      }

      const video = await prisma.videoAsset.create({
        data: {
          projectId,
          originalName: item.originalName,
          storageKey,
          mimeType: item.mimeType || guessMime(item.originalName),
          sizeBytes: item.sizeBytes ?? 0,
          status: "uploading",
          checksum: item.pathname || null,
        },
      });

      await enqueueAndProcess({
        projectId,
        type: "import",
        payload: { videoId: video.id },
      });

      upserted.push(video);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    const count = await prisma.videoAsset.count({ where: { projectId } });

    return NextResponse.json(
      { videos: upserted, videoCount: count },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Sync impossible";
    console.error("[videos/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);
    const videos = await prisma.videoAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        sizeBytes: true,
        durationSec: true,
        status: true,
        storageKey: true,
        createdAt: true,
      },
    });
    return NextResponse.json(
      { videoCount: videos.length, videos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
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
