"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBytes, formatDuration, statusLabel } from "@/lib/utils/helpers";

type ProjectPayload = {
  id: string;
  name: string;
  status: string;
  format: string;
  prompt: string | null;
  tone: string | null;
  targetDurationSec: number;
  errorMessage: string | null;
  videos: Array<{
    id: string;
    originalName: string;
    sizeBytes: number;
    durationSec: number | null;
    status: string;
  }>;
  jobs: Array<{ id: string; type: string; status: string; progress: number; errorLog?: string | null }>;
  timelines: Array<{ id: string; durationSec: number }>;
  editorial: { hook: string | null; cta: string | null; publishTitle: string | null } | null;
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur de chargement");
      return;
    }
    setProject(data.project);
    setPrompt(data.project.prompt ?? "");
  }, [id]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void load();
    }, 0);
    const t = setInterval(() => {
      void load();
    }, 2500);
    return () => {
      clearTimeout(boot);
      clearInterval(t);
    };
  }, [load]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/projects/${id}/upload`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(data.error || "Upload échoué");
      return;
    }
    await load();
  }

  async function savePrompt() {
    setSavingPrompt(true);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setSavingPrompt(false);
    await load();
  }

  async function startGenerate() {
    await savePrompt();
    const res = await fetch(`/api/projects/${id}/generate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Génération impossible");
    await load();
  }

  async function cancelJobs() {
    await fetch(`/api/projects/${id}/jobs`, { method: "DELETE" });
    await load();
  }

  if (!project) {
    return <p className="text-[var(--muted)]">Chargement du projet…</p>;
  }

  const ready = project.status === "ready" || project.status === "completed";
  const processing = ["pending", "importing", "analyzing", "transcribing", "generating", "exporting"].includes(
    project.status,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="badge mb-2">{statusLabel(project.status)}</p>
          <h1 className="font-display text-3xl font-bold">{project.name}</h1>
          <p className="text-sm text-[var(--muted)]">
            {project.format} · cible {project.targetDurationSec}s
            {project.tone ? ` · ${project.tone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ready && (
            <>
              <Link href={`/projects/${id}/editor`} className="btn btn-primary">
                Ouvrir l&apos;éditeur
              </Link>
              <Link href={`/projects/${id}/export`} className="btn btn-ghost">
                Exporter
              </Link>
            </>
          )}
          {processing && (
            <button type="button" className="btn btn-ghost" onClick={cancelJobs}>
              Annuler le traitement
            </button>
          )}
        </div>
      </div>

      {project.errorMessage && (
        <div className="rounded-xl border border-[var(--danger)] bg-[rgba(224,122,106,0.08)] p-4 text-sm">
          {project.errorMessage}
        </div>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">1. Import des vidéos</h2>
        <label className="btn btn-ghost cursor-pointer">
          {uploading ? "Import…" : "Choisir des fichiers"}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>
        <ul className="mt-4 space-y-2">
          {project.videos.map((v) => (
            <li key={v.id} className="flex justify-between gap-3 text-sm">
              <span>
                {v.originalName}{" "}
                <span className="text-[var(--muted)]">
                  ({formatBytes(v.sizeBytes)}
                  {v.durationSec != null ? ` · ${formatDuration(v.durationSec)}` : ""})
                </span>
              </span>
              <span className="badge">{statusLabel(v.status)}</span>
            </li>
          ))}
          {project.videos.length === 0 && (
            <li className="text-sm text-[var(--muted)]">Aucune vidéo importée.</li>
          )}
        </ul>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">2. Consigne de montage</h2>
        <textarea
          className="input min-h-32"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Décrivez le montage souhaité…"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={savePrompt} disabled={savingPrompt}>
            {savingPrompt ? "Sauvegarde…" : "Sauvegarder la consigne"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startGenerate}
            disabled={project.videos.length === 0}
          >
            Lancer analyse & génération
          </button>
        </div>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">3. Progression</h2>
        <ul className="space-y-2">
          {project.jobs.slice(0, 12).map((j) => (
            <li key={j.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
              <span>
                {j.type} — {statusLabel(j.status)}
              </span>
              <div className="h-2 w-28 overflow-hidden rounded bg-[var(--bg-soft)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${j.progress}%` }}
                />
              </div>
              <span className="text-[var(--muted)]">{j.progress}%</span>
            </li>
          ))}
          {project.jobs.length === 0 && (
            <li className="text-sm text-[var(--muted)]">Aucun traitement pour le moment.</li>
          )}
        </ul>
        {project.timelines[0] && (
          <p className="mt-4 text-sm text-[var(--success)]">
            Timeline prête · {formatDuration(project.timelines[0].durationSec)}
            {project.editorial?.hook ? ` · Accroche : « ${project.editorial.hook} »` : ""}
          </p>
        )}
      </section>
    </div>
  );
}
