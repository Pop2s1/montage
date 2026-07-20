import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { enqueueAndProcess } from "@/lib/queue/inline";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Blob client-upload protocol.
 * NOTE: the "blob.upload-completed" callback is server-to-server (no user cookie),
 * so we must NOT require a session for that type.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params;

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Stockage Blob non configuré. Sur Vercel → Storage → Create → Blob, puis reconnecte le projet montage.",
          code: "BLOB_MISSING",
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as HandleUploadBody;
    const isCompletion = body.type === "blob.upload-completed";

    let userId: string | null = null;
    if (!isCompletion) {
      const user = await requireUser();
      await requireProject(projectId, user.id);
      userId = user.id;
      if (!rateLimit(`blob-token:${user.id}`, 60, 60_000)) {
        return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
      }
    }

    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!userId) throw new Error("Non authentifié");
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-m4v",
            "video/3gpp",
            "video/3gpp2",
            "application/octet-stream",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 500 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            projectId,
            userId,
            originalName: pathname.split("/").pop() || "video.mp4",
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Backup registration if the browser never calls /upload/complete
        try {
          const payload = JSON.parse(tokenPayload || "{}") as {
            projectId?: string;
            userId?: string;
            originalName?: string;
          };
          const pid = payload.projectId || projectId;
          if (!pid || !payload.userId) return;

          const existing = await prisma.videoAsset.findFirst({
            where: { projectId: pid, storageKey: `blob:${blob.url}` },
          });
          if (existing) return;

          const video = await prisma.videoAsset.create({
            data: {
              projectId: pid,
              originalName: payload.originalName || blob.pathname.split("/").pop() || "video.mp4",
              storageKey: `blob:${blob.url}`,
              mimeType: blob.contentType || "video/mp4",
              sizeBytes: 0,
              status: "uploading",
              checksum: blob.pathname,
            },
          });

          await enqueueAndProcess({
            projectId: pid,
            type: "import",
            payload: { videoId: video.id },
          });

          await prisma.project.update({
            where: { id: pid },
            data: { status: "pending", errorMessage: null },
          });
        } catch (err) {
          console.error("[blob] onUploadCompleted registration failed", err);
        }
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Token upload impossible";
    console.error("[blob] upload token error", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
