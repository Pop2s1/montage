import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

/** Start or restart montage generation once videos are ready. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);

    const videos = await prisma.videoAsset.findMany({ where: { projectId: id } });
    if (videos.length === 0) {
      return NextResponse.json({ error: "Importez au moins une vidéo" }, { status: 400 });
    }

    const project = await prisma.project.findUniqueOrThrow({ where: { id } });
    if (!project.prompt?.trim()) {
      return NextResponse.json({ error: "Ajoutez une consigne de montage" }, { status: 400 });
    }

    // Cancel previous generate jobs still pending
    await prisma.processingJob.updateMany({
      where: { projectId: id, type: "generate", status: { in: ["pending", "running"] } },
      data: { status: "cancelled", finishedAt: new Date() },
    });

    const job = await enqueueAndProcess({ projectId: id, type: "generate", payload: {} });
    await prisma.project.update({ where: { id }, data: { status: "generating", errorMessage: null } });

    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
