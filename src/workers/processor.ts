import {
  completeJob,
  failJob,
  claimNextJob,
} from "@/lib/queue/jobs";
import {
  processAnalyzeJob,
  processExportJob,
  processGenerateJob,
  processImportJob,
  processTranscribeJob,
} from "@/lib/services/pipeline";
import { safeJsonParse } from "@/lib/utils/helpers";
import { getEnv } from "@/lib/config/env";

export async function runOneJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  const payload = safeJsonParse<Record<string, unknown>>(job.payloadJson, {});

  try {
    switch (job.type) {
      case "import":
        await processImportJob(job.id, job.projectId, payload as { videoId: string });
        break;
      case "analyze":
        await processAnalyzeJob(job.id, job.projectId, payload as { videoId: string });
        break;
      case "transcribe":
        await processTranscribeJob(job.id, job.projectId, payload as { videoId: string });
        break;
      case "generate":
        await processGenerateJob(job.id, job.projectId);
        break;
      case "export":
        await processExportJob(job.id, job.projectId, payload as { exportId: string });
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    await completeJob(job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} failed:`, message);
    const retried = await failJob(job.id, message, job.maxAttempts, job.attempts);
    if (!retried) {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.project.update({
        where: { id: job.projectId },
        data: { status: "failed", errorMessage: message.slice(0, 2000) },
      });
    }
  }

  return true;
}

export async function workerLoop(signal?: AbortSignal) {
  const poll = getEnv().WORKER_POLL_MS;
  console.log(`[worker] started (poll=${poll}ms)`);
  while (!signal?.aborted) {
    const did = await runOneJob();
    if (!did) {
      await sleep(poll);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
