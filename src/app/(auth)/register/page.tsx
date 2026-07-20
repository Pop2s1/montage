"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    };
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Inscription impossible");
      setLoading(false);
      return;
    }
    const login = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) {
      setError("Compte créé, mais connexion impossible. Essayez via la page Connexion.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="font-display mb-8 text-2xl font-bold">
        Montage<span style={{ color: "var(--accent)" }}>.</span>
      </Link>
      <div className="surface animate-rise rounded-2xl p-6">
        <h1 className="font-display mb-1 text-2xl font-bold">Créer un compte</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">Commencez à monter vos vidéos avec l&apos;IA.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Nom
            </label>
            <input className="input" id="name" name="name" required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Mot de passe (8 caractères min.)
            </label>
            <input className="input" id="password" name="password" type="password" required minLength={8} />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Création…" : "S'inscrire"}
          </button>
        </form>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Déjà inscrit ?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
