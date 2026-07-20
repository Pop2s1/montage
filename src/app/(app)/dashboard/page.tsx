import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { formatDuration, statusLabel } from "@/lib/utils/helpers";
import { FORMAT_SPECS, type ProjectFormat } from "@/types/domain";

export default async function DashboardPage() {
  const session = await auth();
  const projects = await prisma.project.findMany({
    where: { userId: session!.user!.id },
    orderBy: { updatedAt: "desc" },
    include: {
      videos: { select: { durationSec: true } },
      jobs: {
        where: { status: { in: ["pending", "running"] } },
        select: { id: true, type: true, progress: true, status: true },
      },
    },
  });

  const activeJobs = projects.flatMap((p) =>
    p.jobs.map((j) => ({ ...j, projectName: p.name, projectId: p.id })),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Tableau de bord</h1>
          <p className="text-[var(--muted)]">Bonjour {session?.user?.name ?? ""} — reprisez vos montages.</p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">
          Nouveau projet
        </Link>
      </div>

      {activeJobs.length > 0 && (
        <section className="surface rounded-2xl p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">Traitements en cours</h2>
          <ul className="space-y-2">
            {activeJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <Link href={`/projects/${j.projectId}`} className="underline-offset-2 hover:underline">
                    {j.projectName}
                  </Link>{" "}
                  — {j.type} ({statusLabel(j.status)})
                </span>
                <span className="badge animate-pulse-soft">{j.progress}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display mb-4 text-lg font-semibold">Projets récents</h2>
        {projects.length === 0 ? (
          <div className="surface rounded-2xl p-10 text-center">
            <p className="mb-4 text-[var(--muted)]">Aucun projet pour l&apos;instant.</p>
            <Link href="/projects/new" className="btn btn-primary">
              Créer mon premier montage
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const duration = p.videos.reduce((a, v) => a + (v.durationSec ?? 0), 0);
              const format = FORMAT_SPECS[p.format as ProjectFormat]?.label ?? p.format;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="surface group overflow-hidden rounded-2xl transition hover:border-[var(--accent-dim)]"
                >
                  <div
                    className="flex h-36 items-end bg-[#0c0f14] p-3"
                    style={{
                      backgroundImage: p.thumbnailPath
                        ? undefined
                        : "linear-gradient(135deg, #2a3140, #151a21)",
                    }}
                  >
                    <span className="badge bg-black/50">{statusLabel(p.status)}</span>
                  </div>
                  <div className="space-y-1 p-4">
                    <h3 className="font-display font-semibold group-hover:text-[var(--accent-strong)]">
                      {p.name}
                    </h3>
                    <p className="text-xs text-[var(--muted)]">
                      {format} · {formatDuration(duration)} ·{" "}
                      {new Date(p.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                    {p.errorMessage && (
                      <p className="truncate text-xs text-[var(--danger)]">{p.errorMessage}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
