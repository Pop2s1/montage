import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser, requireProject, rateLimit } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Issues a short-lived client upload token for Vercel Blob.
 * Large phone videos must bypass the 4.5MB serverless body limit.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id: projectId } = await ctx.params;
    await requireProject(projectId, user.id);

    if (!rateLimit(`blob-token:${user.id}`, 60, 60_000)) {
      return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Stockage Blob non configuré. Sur Vercel → Storage → Create Blob Store, puis reconnecte le projet.",
          code: "BLOB_MISSING",
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as HandleUploadBody;

    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "video/x-m4v",
          "video/3gpp",
          "video/3gpp2",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 500 * 1024 * 1024,
        tokenPayload: JSON.stringify({ projectId, userId: user.id }),
      }),
      onUploadCompleted: async () => {
        // Completion is confirmed by our /upload/complete route from the client.
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Token upload impossible";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
