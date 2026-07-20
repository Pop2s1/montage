import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { cancelProjectJobs } from "@/lib/queue/jobs";
import { getStorage } from "@/lib/providers/storage/local";
import { TONE_PRESETS } from "@/types/domain";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: true,
        analyses: true,
        transcripts: true,
        settings: true,
        editorial: true,
        variants: true,
        jobs: { orderBy: { createdAt: "desc" }, take: 20 },
        timelines: {
          orderBy: { updatedAt: "desc" },
          include: {
            segments: { orderBy: { orderIndex: "asc" } },
            subtitles: { orderBy: { orderIndex: "asc" } },
            texts: true,
            tracks: { orderBy: { orderIndex: "asc" } },
          },
        },
        exports: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  prompt: z.string().max(4000).optional(),
  tone: z.enum(TONE_PRESETS).nullable().optional(),
  targetDurationSec: z.number().int().min(10).max(600).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const project = await prisma.project.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);
    await cancelProjectJobs(id);

    const videos = await prisma.videoAsset.findMany({ where: { projectId: id } });
    const storage = getStorage();
    for (const v of videos) {
      await storage.delete(v.storageKey);
      if (v.thumbnailPath) await storage.delete(v.thumbnailPath);
    }

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
