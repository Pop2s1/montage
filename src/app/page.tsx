import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-display text-2xl font-700 tracking-tight">
          Montage<span style={{ color: "var(--accent)" }}>.</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost">
            Connexion
          </Link>
          <Link href="/register" className="btn btn-primary">
            Créer un compte
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid min-h-[78vh] max-w-6xl items-center gap-10 px-6 pb-20 pt-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="animate-rise">
          <p className="font-display mb-4 text-5xl leading-[0.95] font-extrabold md:text-7xl">
            Montage
          </p>
          <h1 className="mb-4 max-w-xl text-2xl leading-snug text-[var(--muted)] md:text-3xl">
            Décrivez le film que vous voulez. L&apos;IA assemble vos rushes.
          </h1>
          <p className="mb-8 max-w-lg text-[var(--muted)]">
            Importez plusieurs vidéos, donnez une consigne en langage naturel, obtenez un Reel
            vertical sous-titré prêt à peaufiner dans l&apos;éditeur.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">
              Commencer gratuitement
            </Link>
            <Link href="/login" className="btn btn-ghost">
              J&apos;ai déjà un compte
            </Link>
          </div>
        </div>

        <div
          className="animate-rise surface relative overflow-hidden rounded-2xl p-5"
          style={{ animationDelay: "120ms" }}
        >
          <div
            className="absolute inset-0 opacity-80"
            style={{
              background:
                "linear-gradient(160deg, rgba(232,164,90,0.25), transparent 45%), url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h60v60H0z\" fill=\"none\"/%3E%3Cpath d=\"M0 30h60M30 0v60\" stroke=\"%232f3846\" stroke-width=\"1\"/%3E%3C/svg%3E')",
            }}
          />
          <div className="relative space-y-4">
            <div className="rounded-xl bg-black/35 p-4">
              <p className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">Consigne</p>
              <p className="text-sm leading-relaxed">
                « Crée un Reel Instagram dynamique de 45 secondes. Meilleurs moments, silences
                coupés, sous-titres modernes, accroche forte, CTA final. »
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["Import", "Analyse", "Montage"].map((step, i) => (
                <div key={step} className="rounded-lg bg-black/30 p-3 text-center">
                  <div className="mb-1 text-xs text-[var(--accent)]">0{i + 1}</div>
                  <div className="text-sm font-medium">{step}</div>
                </div>
              ))}
            </div>
            <div className="h-40 overflow-hidden rounded-xl border border-[var(--line)] bg-[#0c0f14]">
              <div className="flex h-full items-end gap-1 px-3 pb-3">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${30 + ((i * 37) % 60)}%`,
                      background:
                        i % 5 === 0
                          ? "var(--accent)"
                          : "linear-gradient(180deg, #3a4556, #232a35)",
                      animation: `pulse-soft ${1.4 + (i % 5) * 0.2}s ease-in-out infinite`,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
