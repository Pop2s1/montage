import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/providers/storage/local";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

type Ctx = { params: Promise<{ token: string }> };

/** Temporary signed download via opaque token (no long-lived public URLs). */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const job = await prisma.exportJob.findFirst({
    where: { downloadToken: token },
  });

  if (!job || !job.outputKey) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  if (!job.downloadExpiresAt || job.downloadExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Lien expiré" }, { status: 410 });
  }

  const storage = getStorage();
  const abs = storage.absolutePath(job.outputKey);
  const st = await stat(abs);
  const stream = createReadStream(abs);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(st.size),
      "Content-Disposition": `attachment; filename="montage-${job.id}.mp4"`,
      "Cache-Control": "private, no-store",
    },
  });
}
