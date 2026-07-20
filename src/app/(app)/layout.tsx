import Link from "next/link";
import { auth, signOut } from "@/lib/auth/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="font-display text-xl font-bold">
            Montage<span style={{ color: "var(--accent)" }}>.</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-[var(--muted)] hover:text-[var(--text)]">
              Tableau de bord
            </Link>
            <Link href="/projects/new" className="text-[var(--muted)] hover:text-[var(--text)]">
              Nouveau projet
            </Link>
            <Link href="/settings" className="text-[var(--muted)] hover:text-[var(--text)]">
              Compte
            </Link>
            <span className="hidden text-[var(--muted)] sm:inline">{session?.user?.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="btn btn-ghost px-3 py-1.5 text-sm">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
