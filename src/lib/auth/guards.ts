import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session.user as { id: string; email: string; name?: string | null };
}

export async function requireProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) {
    throw new Response(JSON.stringify({ error: "Projet introuvable" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return project;
}

/** Simple in-memory rate limiter for sensitive routes */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
