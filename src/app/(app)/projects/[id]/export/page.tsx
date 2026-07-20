"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBytes, statusLabel } from "@/lib/utils/helpers";

type ExportRow = {
  id: string;
  status: string;
  progress: number;
  width: number;
  height: number;
  fps: number;
  quality: string;
  burnSubtitles: boolean;
  estimatedBytes: number | null;
  actualBytes: number | null;
  downloadToken: string | null;
  errorMessage: string | null;
};

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/export`);
    const data = await res.json();
    if (res.ok) setExports(data.exports);
  }, [id]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void load();
    }, 0);
    const t = setInterval(() => {
      void load();
    }, 2000);
    return () => {
      clearTimeout(boot);
      clearInterval(t);
    };
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/projects/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quality: String(fd.get("quality")),
        fps: Number(fd.get("fps")),
        burnSubtitles: fd.get("burnSubtitles") === "on",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Export impossible");
      return;
    }
    await load();
  }

  async function retry(exportId: string) {
    // Re-enqueue by creating a new export with same defaults via API
    const prev = exports.find((x) => x.id === exportId);
    if (!prev) return;
    const res = await fetch(`/api/projects/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quality: prev.quality,
        fps: prev.fps,
        burnSubtitles: prev.burnSubtitles,
        width: prev.width,
        height: prev.height,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Relance impossible");
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href={`/projects/${id}/editor`} className="text-sm text-[var(--muted)]">
          ← Éditeur
        </Link>
        <h1 className="font-display mt-2 text-3xl font-bold">Export</h1>
        <p className="text-[var(--muted)]">Choisissez qualité et options, puis téléchargez le MP4.</p>
      </div>

      <form onSubmit={onSubmit} className="surface space-y-4 rounded-2xl p-6">
        <div>
          <label className="label" htmlFor="quality">
            Qualité
          </label>
          <select className="input" id="quality" name="quality" defaultValue="high">
            <option value="low">Basse</option>
            <option value="medium">Moyenne</option>
            <option value="high">Haute</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fps">
            Images / seconde
          </label>
          <select className="input" id="fps" name="fps" defaultValue="30">
            <option value="24">24</option>
            <option value="30">30</option>
            <option value="60">60</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="burnSubtitles" defaultChecked />
          Intégrer les sous-titres dans la vidéo
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Lancement…" : "Lancer l'export"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Historique</h2>
        {exports.map((ex) => (
          <div key={ex.id} className="surface rounded-xl p-4 text-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                {ex.width}×{ex.height} · {ex.fps} fps · {ex.quality} · {statusLabel(ex.status)}
              </span>
              <span className="badge">{ex.progress}%</span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded bg-[var(--bg-soft)]">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${ex.progress}%` }} />
            </div>
            <p className="text-[var(--muted)]">
              Estimation : {ex.estimatedBytes != null ? formatBytes(ex.estimatedBytes) : "—"}
              {ex.actualBytes != null ? ` · Final : ${formatBytes(ex.actualBytes)}` : ""}
            </p>
            {ex.errorMessage && <p className="text-[var(--danger)]">{ex.errorMessage}</p>}
            <div className="mt-3 flex gap-2">
              {ex.status === "completed" && ex.downloadToken && (
                <a className="btn btn-primary py-1.5" href={`/api/downloads/${ex.downloadToken}`}>
                  Télécharger
                </a>
              )}
              {ex.status === "failed" && (
                <button type="button" className="btn btn-ghost py-1.5" onClick={() => retry(ex.id)}>
                  Relancer
                </button>
              )}
            </div>
          </div>
        ))}
        {exports.length === 0 && <p className="text-[var(--muted)]">Aucun export pour l&apos;instant.</p>}
      </section>
    </div>
  );
}
