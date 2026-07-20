import { prisma } from "@/lib/db/prisma";
import type { JobType } from "@/types/domain";

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
  const job = await prisma.processingJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

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
