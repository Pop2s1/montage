"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FORMAT_SPECS, TONE_PRESETS, type ProjectFormat } from "@/types/domain";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tone, setTone] = useState<string>("dynamique");
  const [format, setFormat] = useState<ProjectFormat>("instagram_reel");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        format,
        targetDurationSec: Number(fd.get("targetDurationSec") || 45),
        tone,
        prompt: String(fd.get("prompt") || ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Création impossible");
      return;
    }
    router.push(`/projects/${data.project.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display mb-2 text-3xl font-bold">Nouveau projet</h1>
      <p className="mb-8 text-[var(--muted)]">
        Nommez votre projet, choisissez le format, puis décrivez le montage souhaité.
      </p>

      <form onSubmit={onSubmit} className="surface space-y-6 rounded-2xl p-6">
        <div>
          <label className="label" htmlFor="name">
            Nom du projet
          </label>
          <input className="input" id="name" name="name" required placeholder="Événement printemps 2026" />
        </div>

        <div>
          <label className="label">Format de sortie</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(FORMAT_SPECS) as ProjectFormat[]).map((key) => {
              const spec = FORMAT_SPECS[key];
              const active = format === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  className="rounded-xl border p-3 text-left transition"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--line)",
                    background: active ? "rgba(232,164,90,0.08)" : "transparent",
                  }}
                >
                  <div className="font-medium">{spec.label}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {spec.aspect} · {spec.width}×{spec.height}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="targetDurationSec">
            Durée cible (secondes)
          </label>
          <input
            className="input"
            id="targetDurationSec"
            name="targetDurationSec"
            type="number"
            min={10}
            max={600}
            defaultValue={45}
          />
        </div>

        <div>
          <label className="label">Ton / option rapide</label>
          <div className="flex flex-wrap gap-2">
            {TONE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className="badge"
                style={{
                  borderColor: tone === t ? "var(--accent)" : "var(--line)",
                  color: tone === t ? "var(--accent-strong)" : undefined,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="prompt">
            Consigne en langage naturel
          </label>
          <textarea
            className="input min-h-36"
            id="prompt"
            name="prompt"
            placeholder="Crée un Reel Instagram dynamique de 45 secondes sur notre événement. Utilise les meilleurs moments, supprime les silences, ajoute des sous-titres modernes, une accroche forte au début et un appel à l'action à la fin."
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Thème, objectif, ton, durée, public, rythme, éléments à garder/supprimer, style des
            sous-titres, accroche, CTA…
          </p>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Création…" : "Créer le projet"}
        </button>
      </form>
    </div>
  );
}
