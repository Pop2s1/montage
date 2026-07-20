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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setPendingFiles(Array.from(files));
  }

  async function onImport() {
    if (!pendingFiles.length) {
      setError("Choisis d'abord une ou plusieurs vidéos.");
      return;
    }
    setUploading(true);
    setError(null);
    let imported = 0;
    const failures: string[] = [];

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i]!;
        setUploadProgress(`Import ${i + 1}/${pendingFiles.length} — ${file.name}`);
        try {
          const useBlob = file.size > 4 * 1024 * 1024;
          if (useBlob) {
            await uploadViaBlob(file);
          } else {
            await uploadDirect(file);
          }
          imported += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload échoué";
          failures.push(`${file.name}: ${message}`);
        }
      }

      await load();
      // Force a second refresh shortly after (Blob callback may land slightly later)
      setTimeout(() => {
        void load();
      }, 1500);

      if (imported > 0) {
        setPendingFiles([]);
        setUploadProgress(`${imported} vidéo(s) importée(s). Traitement en cours…`);
      } else {
        setUploadProgress(null);
      }

      if (failures.length) {
        setError(failures.join("\n"));
      } else if (imported === 0) {
        setError("Aucune vidéo importée. Réessaie ou vérifie Vercel Blob.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function uploadDirect(file: File) {
    const fd = new FormData();
    fd.append("files", file);
    const res = await fetch(`/api/projects/${id}/upload`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Upload échoué (${res.status})`);
    }
    if (!data.videos?.length) {
      throw new Error("Le serveur n'a renvoyé aucune vidéo.");
    }
  }

  async function uploadViaBlob(file: File) {
    const { upload } = await import("@vercel/blob/client");
    let blob;
    try {
      blob = await upload(file.name || `video-${Date.now()}.mp4`, file, {
        access: "public",
        handleUploadUrl: `/api/projects/${id}/upload/token`,
        multipart: true,
        contentType: file.type || "video/mp4",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Blob upload failed";
      if (
        message.includes("BLOB_MISSING") ||
        message.includes("Blob non configuré") ||
        message.includes("No token") ||
        message.toLowerCase().includes("blob")
      ) {
        throw new Error(
          `« ${file.name} » (${(file.size / (1024 * 1024)).toFixed(1)} Mo) nécessite Vercel Blob. Va dans Vercel → Storage → Create → Blob, connecte le projet, redeploy, puis réessaie. Ou utilise une vidéo < 4 Mo.`,
        );
      }
      throw new Error(message);
    }

    const res = await fetch(`/api/projects/${id}/upload/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: blob.url,
        pathname: blob.pathname,
        originalName: file.name || "video.mp4",
        sizeBytes: file.size,
        mimeType: file.type || "video/mp4",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Blob file is online; completion route failed — still ask UI to reload
      throw new Error(data.error || "Vidéo uploadée mais non enregistrée dans le projet");
    }
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
      {error && (
        <p className="whitespace-pre-wrap text-sm text-[var(--danger)]">{error}</p>
      )}

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">1. Import des vidéos</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Depuis un téléphone : choisis tes vidéos, puis appuie sur <strong>Importer</strong>.
          Les fichiers &gt; 4&nbsp;Mo nécessitent Vercel Blob (Storage).
        </p>

        <div className="flex flex-wrap gap-2">
          <label className="btn btn-ghost cursor-pointer">
            Choisir des vidéos
            <input
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm,.3gp"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading || pendingFiles.length === 0}
            onClick={() => void onImport()}
          >
            {uploading ? "Import en cours…" : "Importer"}
          </button>
        </div>

        {pendingFiles.length > 0 && (
          <ul className="mt-4 space-y-2 rounded-xl border border-[var(--line)] bg-black/20 p-3">
            {pendingFiles.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-[var(--muted)]">
                  {(f.size / (1024 * 1024)).toFixed(1)} Mo
                  {f.size > 4 * 1024 * 1024 ? " · Blob" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {uploadProgress && (
          <p className="mt-3 text-sm text-[var(--accent-strong)]">{uploadProgress}</p>
        )}

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
          {project.videos.length === 0 && pendingFiles.length === 0 && (
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
