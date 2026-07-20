import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function VariantsPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const project = await prisma.project.findFirst({
    where: { id, userId: session!.user!.id },
    include: { variants: { orderBy: { createdAt: "desc" } } },
  });

  if (!project) {
    return <p>Projet introuvable</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-[var(--muted)]">
          ← Projet
        </Link>
        <h1 className="font-display mt-2 text-3xl font-bold">Variantes</h1>
        <p className="text-[var(--muted)]">
          Chaque variante est sauvegardée séparément. La génération multi-variantes avancée arrive en
          V2 ; le MVP conserve la version principale.
        </p>
      </div>
      <ul className="space-y-3">
        {project.variants.map((v) => (
          <li key={v.id} className="surface rounded-xl p-4">
            <div className="font-medium">
              {v.name} {v.isPrimary ? <span className="badge">Principale</span> : null}
            </div>
            <div className="text-sm text-[var(--muted)]">Style : {v.style}</div>
          </li>
        ))}
        {project.variants.length === 0 && (
          <li className="text-[var(--muted)]">Aucune variante générée pour l&apos;instant.</li>
        )}
      </ul>
    </div>
  );
}
