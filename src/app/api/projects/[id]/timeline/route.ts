import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

const segmentPatch = z.object({
  id: z.string(),
  sourceStartSec: z.number().min(0).optional(),
  sourceEndSec: z.number().min(0).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const subtitlePatch = z.object({
  id: z.string(),
  text: z.string().min(1).max(500).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
});

const bodySchema = z.object({
  timelineId: z.string(),
  segments: z.array(segmentPatch).optional(),
  subtitles: z.array(subtitlePatch).optional(),
  reorderSegmentIds: z.array(z.string()).optional(),
  deleteSegmentIds: z.array(z.string()).optional(),
  overlayTexts: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1).max(300),
      }),
    )
    .optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const timeline = await prisma.timeline.findFirst({
      where: { id: parsed.data.timelineId, projectId },
      include: { segments: { orderBy: { orderIndex: "asc" } } },
    });
    if (!timeline) {
      return NextResponse.json({ error: "Timeline introuvable" }, { status: 404 });
    }

    if (parsed.data.deleteSegmentIds?.length) {
      await prisma.timelineSegment.deleteMany({
        where: { timelineId: timeline.id, id: { in: parsed.data.deleteSegmentIds } },
      });
    }

    if (parsed.data.segments) {
      for (const s of parsed.data.segments) {
        const data: Record<string, number> = {};
        if (s.sourceStartSec != null) data.sourceStartSec = s.sourceStartSec;
        if (s.sourceEndSec != null) data.sourceEndSec = s.sourceEndSec;
        if (s.orderIndex != null) data.orderIndex = s.orderIndex;
        if (s.sourceStartSec != null && s.sourceEndSec != null) {
          data.durationSec = Math.max(0.1, s.sourceEndSec - s.sourceStartSec);
        } else if (s.sourceStartSec != null || s.sourceEndSec != null) {
          const current = await prisma.timelineSegment.findUnique({ where: { id: s.id } });
          if (current) {
            const start = s.sourceStartSec ?? current.sourceStartSec;
            const end = s.sourceEndSec ?? current.sourceEndSec;
            data.durationSec = Math.max(0.1, end - start);
          }
        }
        await prisma.timelineSegment.update({ where: { id: s.id }, data });
      }
    }

    if (parsed.data.reorderSegmentIds?.length) {
      let cursor = 0;
      for (let i = 0; i < parsed.data.reorderSegmentIds.length; i++) {
        const sid = parsed.data.reorderSegmentIds[i]!;
        const seg = await prisma.timelineSegment.findUnique({ where: { id: sid } });
        if (!seg || seg.timelineId !== timeline.id) continue;
        const durationSec = seg.durationSec;
        await prisma.timelineSegment.update({
          where: { id: sid },
          data: { orderIndex: i, timelineStartSec: cursor, durationSec },
        });
        cursor = Math.round((cursor + durationSec) * 100) / 100;
      }
      await prisma.timeline.update({
        where: { id: timeline.id },
        data: { durationSec: cursor, version: { increment: 1 } },
      });
    } else {
      // Recompute timeline positions
      const segs = await prisma.timelineSegment.findMany({
        where: { timelineId: timeline.id },
        orderBy: { orderIndex: "asc" },
      });
      let cursor = 0;
      for (const seg of segs) {
        await prisma.timelineSegment.update({
          where: { id: seg.id },
          data: { timelineStartSec: cursor },
        });
        cursor = Math.round((cursor + seg.durationSec) * 100) / 100;
      }
      await prisma.timeline.update({
        where: { id: timeline.id },
        data: { durationSec: cursor, version: { increment: 1 } },
      });
    }

    if (parsed.data.subtitles) {
      for (const c of parsed.data.subtitles) {
        await prisma.subtitleCue.update({
          where: { id: c.id },
          data: {
            text: c.text,
            startSec: c.startSec,
            endSec: c.endSec,
          },
        });
      }
    }

    if (parsed.data.overlayTexts) {
      for (const t of parsed.data.overlayTexts) {
        await prisma.overlayText.update({
          where: { id: t.id },
          data: { text: t.text },
        });
      }
    }

    // Autosave snapshot
    const fresh = await prisma.timeline.findUnique({
      where: { id: timeline.id },
      include: {
        segments: { orderBy: { orderIndex: "asc" } },
        subtitles: { orderBy: { orderIndex: "asc" } },
        texts: true,
      },
    });
    if (fresh) {
      await prisma.timeline.update({
        where: { id: fresh.id },
        data: { snapshotJson: JSON.stringify(fresh) },
      });
    }

    return NextResponse.json({ timeline: fresh });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
