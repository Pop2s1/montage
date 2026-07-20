import { waitUntil } from "@vercel/functions";
import { isVercelRuntime } from "@/lib/video/binaries";
import { enqueueJob } from "@/lib/queue/jobs";
import type { JobType } from "@/types/domain";

/**
 * Enqueue a job and, on Vercel, keep processing the queue after the response
 * using waitUntil (no separate worker process available).
 */
export async function enqueueAndProcess(input: {
  projectId: string;
  type: JobType;
  payload?: Record<string, unknown>;
}) {
  const job = await enqueueJob(input);

  if (isVercelRuntime() || process.env.INLINE_WORKER === "1") {
    waitUntil(drainQueue(8));
  }

  return job;
}

/** Kick the queue without enqueueing (used by cron / manual trigger).
 * Returns how many jobs were processed.
 */
export async function kickQueue(maxJobs = 5): Promise<number> {
  return drainQueue(maxJobs);
}

async function drainQueue(maxJobs: number): Promise<number> {
  const { runOneJob } = await import("@/workers/processor");
  let n = 0;
  for (let i = 0; i < maxJobs; i++) {
    const did = await runOneJob();
    if (!did) break;
    n += 1;
  }
  return n;
}
