import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, rateLimit } from "@/lib/auth/guards";
import { FORMAT_SPECS, PROJECT_FORMATS, TONE_PRESETS } from "@/types/domain";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  format: z.enum(PROJECT_FORMATS),
  targetDurationSec: z.number().int().min(10).max(600).default(45),
  tone: z.enum(TONE_PRESETS).optional(),
  prompt: z.string().max(4000).optional(),
  customWidth: z.number().int().min(360).max(3840).optional(),
  customHeight: z.number().int().min(360).max(3840).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        videos: { select: { id: true, durationSec: true } },
        jobs: {
          where: { status: { in: ["pending", "running"] } },
          select: { id: true, type: true, status: true, progress: true },
        },
      },
    });

    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        format: p.format,
        targetDurationSec: p.targetDurationSec,
        thumbnailPath: p.thumbnailPath,
        errorMessage: p.errorMessage,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        durationSec: p.videos.reduce((acc, v) => acc + (v.durationSec ?? 0), 0),
        activeJobs: p.jobs,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`create-project:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
    }

    const limits = await prisma.accountLimit.findUnique({ where: { userId: user.id } });
    const count = await prisma.project.count({ where: { userId: user.id } });
    if (limits && count >= limits.maxProjects) {
      return NextResponse.json({ error: "Limite de projets atteinte" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const spec = FORMAT_SPECS[parsed.data.format];
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        format: parsed.data.format,
        targetDurationSec: parsed.data.targetDurationSec,
        tone: parsed.data.tone,
        prompt: parsed.data.prompt,
        customWidth: parsed.data.customWidth ?? spec.width,
        customHeight: parsed.data.customHeight ?? spec.height,
        status: "draft",
        settings: { create: {} },
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
