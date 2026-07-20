import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { cancelProjectJobs } from "@/lib/queue/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);

    const jobs = await prisma.processingJob.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { status: true, errorMessage: true },
    });

    return NextResponse.json({ jobs, project });
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
    await prisma.project.update({
      where: { id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
