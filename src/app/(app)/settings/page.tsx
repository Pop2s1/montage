import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils/helpers";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    include: { accounts: true },
  });

  const usage = await prisma.usageEvent.groupBy({
    by: ["kind"],
    where: { userId: session!.user!.id },
    _sum: { quantity: true },
  });

  const byKind = Object.fromEntries(usage.map((u) => [u.kind, u._sum.quantity ?? 0]));

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Paramètres du compte</h1>
        <p className="text-[var(--muted)]">Profil, limites et consommation.</p>
      </div>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">Profil</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Nom</dt>
            <dd>{user?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Offre</dt>
            <dd className="badge">{user?.plan}</dd>
          </div>
        </dl>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">Limites (MVP)</h2>
        <ul className="space-y-2 text-sm">
          <li>Minutes d&apos;import / mois : {user?.accounts?.maxImportMinutesPerMonth}</li>
          <li>Stockage max : {formatBytes(user?.accounts?.maxStorageBytes ?? 0)}</li>
          <li>Exports / mois : {user?.accounts?.maxExportsPerMonth}</li>
          <li>Projets max : {user?.accounts?.maxProjects}</li>
        </ul>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Le paiement n&apos;est pas inclus dans cette version ; les plafonds sont configurables en base.
        </p>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">Consommation</h2>
        <ul className="space-y-2 text-sm">
          <li>Minutes importées : {(byKind.import_minutes ?? 0).toFixed(1)}</li>
          <li>Minutes analysées : {(byKind.analyzed_minutes ?? 0).toFixed(1)}</li>
          <li>Minutes transcrites : {(byKind.transcribed_minutes ?? 0).toFixed(1)}</li>
          <li>Exports : {byKind.export ?? 0}</li>
        </ul>
      </section>

      <Link href="/dashboard" className="btn btn-ghost">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
