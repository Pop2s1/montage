import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  originalName: z.string().min(1).max(260),
  sizeBytes: z.number().int().nonnegative().default(0),
  mimeType: z.string().optional(),
});

/**
 * Create a VideoAsset row BEFORE the Blob upload starts.
 * The row is later updated with the real blob: URL on complete.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`videos-prepare:${user.id}`, 60, 60_000)) {
      return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Métadonnées invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { originalName, sizeBytes, mimeType } = parsed.data;
    const video = await prisma.videoAsset.create({
      data: {
        projectId,
        originalName,
        // Temporary key until Blob URL is known
        storageKey: `pending:${projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        mimeType: mimeType || guessMime(originalName),
        sizeBytes,
        status: "uploading",
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    const videoCount = await prisma.videoAsset.count({ where: { projectId } });

    // Include videoId so Blob listing can always map files back to this project
    const safeName = sanitizeName(originalName);
    const blobPathname = `projects/${projectId}/${video.id}-${safeName}`;

    return NextResponse.json(
      {
        video,
        videoId: video.id,
        videoCount,
        blobPathname,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "prepare failed";
    console.error("[videos/prepare]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120) || "video.mp4";
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  return "video/mp4";
}
