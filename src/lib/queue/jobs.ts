import { prisma } from "@/lib/db/prisma";
import type { JobType } from "@/types/domain";

/** Lower runs first — generate must wait for import/analyze/transcribe. */
const JOB_TYPE_PRIORITY: Record<string, number> = {
  import: 0,
  analyze: 1,
  transcribe: 2,
  generate: 3,
  export: 4,
};

export async function enqueueJob(input: {
  projectId: string;
  type: JobType;
  payload?: Record<string, unknown>;
}) {
  return prisma.processingJob.create({
    data: {
      projectId: input.projectId,
      type: input.type,
      status: "pending",
      payloadJson: JSON.stringify(input.payload ?? {}),
    },
  });
}

export async function cancelProjectJobs(projectId: string) {
  await prisma.processingJob.updateMany({
    where: {
      projectId,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
    },
  });
}

export async function claimNextJob() {
  const pending = await prisma.processingJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  if (!pending.length) return null;

  pending.sort((a, b) => {
    const pa = JOB_TYPE_PRIORITY[a.type] ?? 99;
    const pb = JOB_TYPE_PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const job = pending[0]!;

  // Optimistic claim
  const updated = await prisma.processingJob.updateMany({
    where: { id: job.id, status: "pending" },
    data: {
      status: "running",
      lockedAt: new Date(),
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) return null;
  return prisma.processingJob.findUnique({ where: { id: job.id } });
}

export async function updateJobProgress(jobId: string, progress: number) {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
  });
}

export async function completeJob(jobId: string, result?: Record<string, unknown>) {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      resultJson: JSON.stringify(result ?? {}),
      finishedAt: new Date(),
    },
  });
}

export async function failJob(jobId: string, error: string, maxAttempts: number, attempts: number) {
  const retry = attempts < maxAttempts;
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: retry ? "pending" : "failed",
      errorLog: error.slice(0, 8000),
      finishedAt: retry ? null : new Date(),
      lockedAt: null,
    },
  });
  return retry;
}
