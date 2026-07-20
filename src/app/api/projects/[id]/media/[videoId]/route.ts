import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject } from "@/lib/auth/guards";
import { getStorage } from "@/lib/providers/storage/local";
import { createReadStream } from "fs";
import { Readable } from "stream";

type Ctx = { params: Promise<{ id: string; videoId: string }> };

/** Stream a project video only to its owner (for editor preview). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id, videoId } = await ctx.params;
    await requireProject(id, user.id);

    const video = await prisma.videoAsset.findFirst({
      where: { id: videoId, projectId: id },
    });
    if (!video) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });

    const storage = getStorage();
    const abs = storage.absolutePath(video.storageKey);
    const stream = createReadStream(abs);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": video.mimeType || "video/mp4",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
