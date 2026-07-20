import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
  originalName: z.string().min(1).max(260),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().optional(),
});

/**
 * Registers a video already uploaded to Vercel Blob and enqueues processing.
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
      return NextResponse.json({ error: "Métadonnées invalides" }, { status: 400 });
    }

    const { url, pathname, originalName, sizeBytes, mimeType } = parsed.data;

    // Store blob URL as storage key (downloaded to /tmp by the worker when needed)
    const video = await prisma.videoAsset.create({
      data: {
        projectId,
        originalName,
        storageKey: `blob:${url}`,
        mimeType: mimeType || guessMime(originalName),
        sizeBytes,
        status: "uploading",
        checksum: pathname,
      },
    });

    await enqueueAndProcess({
      projectId,
      type: "import",
      payload: { videoId: video.id },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    return NextResponse.json({ video }, { status: 201 });
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
