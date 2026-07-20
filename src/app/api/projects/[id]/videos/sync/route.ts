import { NextResponse } from "next/server";
import { z } from "zod";
import { list } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const itemSchema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1).optional(),
  originalName: z.string().min(1).max(260),
  sizeBytes: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
  videoId: z.string().optional(),
});

const bodySchema = z.object({
  // Empty array allowed when fromBlobStore scans the store alone
  videos: z.array(itemSchema).max(40).optional(),
  /** Also scan Vercel Blob under projects/{projectId}/ */
  fromBlobStore: z.boolean().optional(),
});

/**
 * Re-register videos into DB from client payload and/or Blob store listing.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`videos-sync:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const upserted = [];
    const incoming = [...(parsed.data.videos ?? [])];

    if (parsed.data.fromBlobStore === true && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const prefixes = [`projects/${projectId}/`, `${projectId}/`];
        for (const prefix of prefixes) {
          const listed = await list({ prefix, limit: 200 });
          for (const blob of listed.blobs) {
            if (!isProbablyVideo(blob.pathname)) continue;
            incoming.push({
              url: blob.url,
              pathname: blob.pathname,
              originalName: basename(blob.pathname),
              sizeBytes: blob.size,
              mimeType: guessMime(blob.pathname),
            });
          }
        }
      } catch (err) {
        console.warn("[videos/sync] blob list failed", err);
      }
    }

    // Dedupe by URL
    const byUrl = new Map<string, (typeof incoming)[number]>();
    for (const item of incoming) {
      byUrl.set(item.url, item);
    }

    for (const item of byUrl.values()) {
      const storageKey = item.url.startsWith("blob:") ? item.url : `blob:${item.url}`;

      let video =
        item.videoId != null
          ? await prisma.videoAsset.findFirst({
              where: { id: item.videoId, projectId },
            })
          : null;

      if (video) {
        video = await prisma.videoAsset.update({
          where: { id: video.id },
          data: {
            storageKey,
            originalName: item.originalName,
            sizeBytes: item.sizeBytes ?? video.sizeBytes,
            mimeType: item.mimeType || video.mimeType,
            checksum: item.pathname || video.checksum,
            status: video.status === "ready" ? "ready" : "uploading",
          },
        });
      } else {
        const existing = await prisma.videoAsset.findFirst({
          where: { projectId, storageKey },
        });
        if (existing) {
          upserted.push(existing);
          continue;
        }
        video = await prisma.videoAsset.create({
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
      }

      if (video.status !== "ready") {
        const pendingJob = await prisma.processingJob.findFirst({
          where: {
            projectId,
            type: "import",
            status: { in: ["pending", "running", "completed"] },
            payloadJson: { contains: video.id },
          },
        });
        if (!pendingJob) {
          await enqueueAndProcess({
            projectId,
            type: "import",
            payload: { videoId: video.id },
          });
        }
      }

      upserted.push(video);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    const count = await prisma.videoAsset.count({ where: { projectId } });

    return NextResponse.json(
      { videos: upserted, videoCount: count, scanned: byUrl.size },
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

function isProbablyVideo(pathname: string) {
  return /\.(mp4|mov|webm|m4v|3gp)$/i.test(pathname);
}

function basename(pathname: string) {
  const part = pathname.split("/").pop() || "video.mp4";
  // Strip Vercel random suffix: name-xxxx.ext → name.ext when possible
  return part.replace(/-[A-Za-z0-9]{6,12}(\.[^.]+)$/, "$1") || part;
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  return "video/mp4";
}
