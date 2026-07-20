import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { getStorage } from "@/lib/providers/storage/local";
import { allowedMimeTypes, getEnv } from "@/lib/config/env";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

/** Direct upload for small files only (Vercel body limit ~4.5MB). Prefer Blob for phone videos. */
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

    const allowed = new Set([
      ...allowedMimeTypes(),
      "video/x-m4v",
      "video/3gpp",
      "video/3gpp2",
      "application/octet-stream",
      "",
    ]);
    const maxBytes = Math.min(getEnv().MAX_UPLOAD_BYTES, 4.5 * 1024 * 1024);
    const storage = getStorage();
    await storage.ensureReady();

    const created = [];

    for (const file of files) {
      const nameOk = /\.(mp4|webm|mov|m4v|3gp)$/i.test(file.name);
      if (!allowed.has(file.type) && !nameOk) {
        return NextResponse.json(
          {
            error: `Format non autorisé: ${file.name} (${file.type || "inconnu"}). Utilisez MP4 ou MOV.`,
          },
          { status: 400 },
        );
      }
      if (file.size > maxBytes) {
        return NextResponse.json(
          {
            error: `« ${file.name} » est trop volumineux pour l'upload direct (${formatMo(file.size)}). Activez Vercel Blob ou compressez la vidéo sous 4 Mo.`,
            code: "FILE_TOO_LARGE",
          },
          { status: 413 },
        );
      }

      const buf = Buffer.from(await file.arrayBuffer());
      if (!looksLikeVideo(buf) && !nameOk) {
        return NextResponse.json(
          { error: `Fichier rejeté: ${file.name}` },
          { status: 400 },
        );
      }

      const key = await storage.createUploadKey(projectId, file.name || "video.mp4");
      await storage.put(key, buf);

      const video = await prisma.videoAsset.create({
        data: {
          projectId,
          originalName: file.name || "video.mp4",
          storageKey: key,
          mimeType: file.type || "video/mp4",
          sizeBytes: file.size,
          status: "uploading",
        },
      });

      await enqueueAndProcess({
        projectId,
        type: "import",
        payload: { videoId: video.id },
      });

      created.push(video);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "pending", errorMessage: null },
    });

    return NextResponse.json({ videos: created }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Upload échoué";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function looksLikeVideo(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const ftyp = buf.subarray(4, 8).toString("ascii") === "ftyp";
  const webm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  return ftyp || webm;
}

function formatMo(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
