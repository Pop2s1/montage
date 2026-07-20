import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { FORMAT_SPECS, type ProjectFormat } from "@/types/domain";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  quality: z.enum(["low", "medium", "high"]).default("high"),
  fps: z.number().int().min(24).max(60).default(30),
  burnSubtitles: z.boolean().default(true),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await requireProject(id, user.id);
    const exports = await prisma.exportJob.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ exports });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const project = await requireProject(id, user.id);

    if (!rateLimit(`export:${user.id}`, 15, 60_000)) {
      return NextResponse.json({ error: "Trop d'exports" }, { status: 429 });
    }

    const limits = await prisma.accountLimit.findUnique({ where: { userId: user.id } });
    if (limits) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const exportsThisMonth = await prisma.usageEvent.count({
        where: { userId: user.id, kind: "export", createdAt: { gte: monthStart } },
      });
      if (exportsThisMonth >= limits.maxExportsPerMonth) {
        return NextResponse.json({ error: "Limite d'exports mensuelle atteinte" }, { status: 403 });
      }
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Options invalides" }, { status: 400 });
    }

    const spec = FORMAT_SPECS[project.format as ProjectFormat] ?? FORMAT_SPECS.instagram_reel;
    const width = parsed.data.width ?? project.customWidth ?? spec.width;
    const height = parsed.data.height ?? project.customHeight ?? spec.height;

    const crf = parsed.data.quality === "low" ? 28 : parsed.data.quality === "medium" ? 23 : 18;
    const timeline = await prisma.timeline.findFirst({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
    });
    const duration = timeline?.durationSec ?? project.targetDurationSec;
    const estimatedBytes = Math.round(duration * width * height * (0.12 / crf));

    const exportJob = await prisma.exportJob.create({
      data: {
        projectId: id,
        format: project.format,
        width,
        height,
        fps: parsed.data.fps,
        quality: parsed.data.quality,
        burnSubtitles: parsed.data.burnSubtitles,
        status: "pending",
        estimatedBytes,
      },
    });

    await enqueueAndProcess({
      projectId: id,
      type: "export",
      payload: { exportId: exportJob.id },
    });

    return NextResponse.json({ export: exportJob }, { status: 202 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
