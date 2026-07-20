import { NextResponse } from "next/server";
import { kickQueue } from "@/lib/queue/inline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron + manual trigger to drain the processing queue.
 * Protect with CRON_SECRET when set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await kickQueue(10);
  return NextResponse.json({ ok: true, drained: true });
}

export async function POST(req: Request) {
  return GET(req);
}
