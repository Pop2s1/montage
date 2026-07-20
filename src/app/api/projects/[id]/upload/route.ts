import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { getStorage } from "@/lib/providers/storage/local";
import { allowedMimeTypes, getEnv } from "@/lib/config/env";
import { enqueueJob } from "@/lib/queue/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`upload:${user.id}`, 40, 60_000)) {
      return NextResponse.json({ error: "Trop d'uploads" }, { status: 429 });
    }

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    }

    const allowed = allowedMimeTypes();
    const maxBytes = getEnv().MAX_UPLOAD_BYTES;
    const storage = getStorage();
    await storage.ensureReady();

    const created = [];

    for (const file of files) {
      if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|webm|mov)$/i)) {
        return NextResponse.json(
          { error: `Format non autorisé: ${file.name} (${file.type || "inconnu"})` },
          { status: 400 },
        );
      }
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `Fichier trop volumineux: ${file.name}` },
          { status: 400 },
        );
      }

      // Basic magic-bytes check for MP4/MOV (ftyp)
      const buf = Buffer.from(await file.arrayBuffer());
      if (!looksLikeVideo(buf)) {
        return NextResponse.json(
          { error: `Fichier suspect rejeté: ${file.name}` },
          { status: 400 },
        );
      }

      const key = await storage.createUploadKey(projectId, file.name);
      await storage.put(key, buf);

      const video = await prisma.videoAsset.create({
        data: {
          projectId,
          originalName: file.name,
          storageKey: key,
          mimeType: file.type || "video/mp4",
          sizeBytes: file.size,
          status: "uploading",
        },
      });

      await enqueueJob({
        projectId,
        type: "import",
        payload: { videoId: video.id },
      });

      created.push(video);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending" },
    });

    return NextResponse.json({ videos: created }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

function looksLikeVideo(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // ISO BMFF (mp4/mov): bytes 4..8 === 'ftyp'
  const ftyp = buf.subarray(4, 8).toString("ascii") === "ftyp";
  // WebM/EBML
  const webm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  return ftyp || webm;
}
