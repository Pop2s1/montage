"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type AiStatus = {
  smartAiEnabled: boolean;
  openaiKeyConfigured: boolean;
  transcriptionProvider: string;
  montageProvider: string;
  message: string;
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const promptRef = useRef("");
  const promptDirtyRef = useRef(false);
  const promptFocusedRef = useRef(false);
  const promptInitializedRef = useRef(false);
  const generatingRef = useRef(false);
  const projectRef = useRef<ProjectPayload | null>(null);

  const load = useCallback(async () => {
    if (generatingRef.current) return;

    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur de chargement");
      return;
    }

    const serverProject = data.project as ProjectPayload;
    setProject((prev) => {
      // Keep optimistic videos that the server has not echoed yet (Blob / DB lag)
      if (!prev?.videos?.length) {
        projectRef.current = serverProject;
        return serverProject;
      }
      const serverIds = new Set((serverProject.videos ?? []).map((v) => v.id));
      const missing = prev.videos.filter((v) => !serverIds.has(v.id));
      const merged =
        missing.length === 0
          ? serverProject
          : {
              ...serverProject,
              videos: [...(serverProject.videos ?? []), ...missing],
            };
      projectRef.current = merged;
      return merged;
    });

    const serverPrompt = serverProject.prompt ?? "";
    if (!promptInitializedRef.current) {
      promptInitializedRef.current = true;
      promptRef.current = serverPrompt;
      setPrompt(serverPrompt);
      promptDirtyRef.current = false;
    } else if (!promptDirtyRef.current && !promptFocusedRef.current) {
      promptRef.current = serverPrompt;
      setPrompt(serverPrompt);
    }
  }, [id]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void load();
    }, 0);
    const t = setInterval(() => {
      void load();
    }, 4000);
    return () => {
      clearTimeout(boot);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    void fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.message) {
          setAiStatus({
            smartAiEnabled: Boolean(data.smartAiEnabled),
            openaiKeyConfigured: Boolean(data.openaiKeyConfigured),
            transcriptionProvider: data.transcriptionProvider ?? "demo",
            montageProvider: data.montageProvider ?? "demo",
            message: data.message,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  function updatePrompt(next: string) {
    promptRef.current = next;
    promptDirtyRef.current = true;
    setPrompt(next);
  }

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
          if (useBlob) await uploadViaBlob(file);
          else await uploadDirect(file);
          imported += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload échoué";
          failures.push(`${file.name}: ${message}`);
        }
      }

      await load();
      setTimeout(() => {
        void load();
      }, 1500);

      if (imported > 0) {
        setPendingFiles([]);
        setUploadProgress(`${imported} vidéo(s) importée(s).`);
      } else {
        setUploadProgress(null);
      }

      if (failures.length) setError(failures.join("\n"));
      else if (imported === 0) setError("Aucune vidéo importée. Réessaie ou vérifie Vercel Blob.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadDirect(file: File) {
    const fd = new FormData();
    fd.append("files", file);
    const res = await fetch(`/api/projects/${id}/upload`, {
      method: "POST",
      body: fd,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload échoué (${res.status})`);
    if (!data.videos?.length) throw new Error("Le serveur n'a renvoyé aucune vidéo.");
    setProject((prev) =>
      prev
        ? {
            ...prev,
            videos: [
              ...data.videos,
              ...prev.videos.filter((v) => !data.videos.some((n: { id: string }) => n.id === v.id)),
            ],
            status: "pending",
          }
        : prev,
    );
    projectRef.current = {
      ...(projectRef.current ?? ({} as ProjectPayload)),
      videos: [
        ...data.videos,
        ...((projectRef.current?.videos ?? []).filter(
          (v) => !data.videos.some((n: { id: string }) => n.id === v.id),
        )),
      ],
    } as ProjectPayload;
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
          `« ${file.name} » (${(file.size / (1024 * 1024)).toFixed(1)} Mo) nécessite Vercel Blob.`,
        );
      }
      throw new Error(message);
    }

    const res = await fetch(`/api/projects/${id}/upload/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        url: blob.url,
        pathname: blob.pathname,
        originalName: file.name || "video.mp4",
        sizeBytes: file.size,
        mimeType: file.type || "video/mp4",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Vidéo uploadée mais non enregistrée dans le projet");
    if (data.video) {
      setProject((prev) => {
        const next = prev
          ? {
              ...prev,
              videos: [data.video, ...prev.videos.filter((v) => v.id !== data.video.id)],
              status: "pending" as const,
            }
          : prev;
        if (next) projectRef.current = next;
        return next;
      });
    }
  }

  async function savePrompt(text?: string) {
    const value = text ?? promptRef.current;
    setSavingPrompt(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sauvegarde impossible");
      }
      promptDirtyRef.current = false;
      setInfo("Consigne sauvegardée.");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function clearPrompt() {
    updatePrompt("");
    setInfo(null);
    setError(null);
    try {
      await savePrompt("");
      setInfo("Consigne effacée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'effacer");
    }
  }

  async function startGenerate() {
    setError(null);
    setInfo("Clic reçu — vérification des vidéos…");

    const trimmed = promptRef.current.trim();
    if (!trimmed) {
      setError("Écris une consigne de montage, puis relance.");
      setInfo(null);
      return;
    }

    // Always re-read from the server — don't trust a possibly stale React closure
    let freshVideos: ProjectPayload["videos"] = projectRef.current?.videos ?? project?.videos ?? [];
    try {
      const probe = await fetch(`/api/projects/${id}`, { cache: "no-store" });
      const probeData = await probe.json();
      if (probe.ok && probeData.project) {
        const serverVideos = probeData.project.videos ?? [];
        const localVideos = projectRef.current?.videos ?? project?.videos ?? [];
        // Prefer the richer of the two lists (avoids false "no videos" on replication lag)
        freshVideos = serverVideos.length >= localVideos.length ? serverVideos : localVideos;
        const mergedProject = {
          ...probeData.project,
          videos: freshVideos,
        } as ProjectPayload;
        projectRef.current = mergedProject;
        setProject(mergedProject);
      }
    } catch {
      // keep local list
    }

    // One short retry if UI had videos but first probe was empty
    if (freshVideos.length === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const retry = await fetch(`/api/projects/${id}`, { cache: "no-store" });
        const retryData = await retry.json();
        if (retry.ok) {
          freshVideos = retryData.project?.videos ?? [];
          if (retryData.project) {
            projectRef.current = retryData.project;
            setProject(retryData.project);
          }
        }
      } catch {
        // ignore
      }
    }

    const videoCount = freshVideos.length;
    const activeJobs =
      projectRef.current?.jobs?.some((j) => j.status === "pending" || j.status === "running") ??
      false;

    if (videoCount === 0) {
      setError(
        "Le serveur ne trouve aucune vidéo pour ce projet (même si l'écran en montrait). Réimporte une vidéo, attends 2 secondes, puis relance.",
      );
      setInfo(null);
      return;
    }

    setInfo(`Clic OK — ${videoCount} vidéo(s) trouvée(s). Lancement…`);

    generatingRef.current = true;
    setGenerating(true);
    try {
      if (activeJobs) {
        await fetch(`/api/projects/${id}/jobs`, { method: "DELETE" }).catch(() => undefined);
      }

      setInfo("Sauvegarde de la consigne…");
      await savePrompt(trimmed);

      setInfo(`Lancement analyse & génération sur ${videoCount} vidéo(s)…`);
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Génération impossible (${res.status})`);
        setInfo(null);
        return;
      }
      setInfo(data.message || "Traitement lancé. Regarde la progression ci-dessous.");
      promptDirtyRef.current = false;
      generatingRef.current = false;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
      setInfo(null);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  async function cancelJobs() {
    await fetch(`/api/projects/${id}/jobs`, { method: "DELETE" });
    await load();
  }

  if (!project) {
    return <p className="text-[var(--muted)]">Chargement du projet…</p>;
  }

  const ready = project.status === "ready" || project.status === "completed";
  const processing = ["importing", "analyzing", "transcribing", "generating", "exporting"].includes(
    project.status,
  );
  const hasActiveJobs = project.jobs.some((j) => j.status === "pending" || j.status === "running");
  const failedJob = project.jobs.find((j) => j.status === "failed" && j.errorLog);
  const busy = generating || processing || hasActiveJobs;

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="badge mb-2">{statusLabel(project.status)}</p>
          <h1 className="font-display text-3xl font-bold">{project.name}</h1>
          <p className="text-sm text-[var(--muted)]">
            {project.format} · cible {project.targetDurationSec}s
            {project.tone ? ` · ${project.tone}` : ""}
            {` · ${project.videos.length} vidéo(s)`}
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
          {busy && (
            <button type="button" className="btn btn-ghost" onClick={() => void cancelJobs()}>
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
        <p className="whitespace-pre-wrap rounded-lg border border-[var(--danger)]/40 bg-[rgba(224,122,106,0.08)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {info && <p className="text-sm text-[var(--success)]">{info}</p>}
      {aiStatus && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            aiStatus.smartAiEnabled
              ? "border-[var(--success)]/40 bg-[rgba(110,180,130,0.08)]"
              : "border-[var(--line)] bg-black/20"
          }`}
        >
          <p className="font-medium">
            {aiStatus.smartAiEnabled ? "IA réelle (OpenAI)" : "Mode démo (heuristiques)"}
          </p>
          <p className="mt-1 text-[var(--muted)]">{aiStatus.message}</p>
        </div>
      )}

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">1. Import des vidéos</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Choisis tes vidéos, puis appuie sur <strong>Importer</strong>.
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
          onChange={(e) => updatePrompt(e.target.value)}
          onFocus={() => {
            promptFocusedRef.current = true;
          }}
          onBlur={() => {
            promptFocusedRef.current = false;
          }}
          placeholder="Décrivez le montage souhaité…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => void savePrompt()}>
            {savingPrompt ? "Sauvegarde…" : "Sauvegarder"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void clearPrompt()}>
            Effacer la consigne
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {project.videos.length} vidéo(s) · consigne {prompt.trim() ? "remplie" : "vide"}
        </p>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">3. Lancer le montage IA</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Analyse les vidéos puis génère la timeline selon ta consigne.
        </p>
        <button
          type="button"
          className="btn btn-primary min-h-14 w-full max-w-md touch-manipulation text-base"
          onClick={() => void startGenerate()}
        >
          {generating
            ? "Traitement en cours… (patiente)"
            : busy
              ? "Relancer analyse & génération"
              : "Lancer analyse & génération"}
        </button>
      </section>

      <section className="surface rounded-2xl p-6">
        <h2 className="font-display mb-3 text-lg font-semibold">4. Progression</h2>
        {failedJob?.errorLog && (
          <p className="mb-3 whitespace-pre-wrap rounded-lg border border-[var(--danger)]/40 bg-[rgba(224,122,106,0.08)] p-3 text-sm text-[var(--danger)]">
            Échec {failedJob.type} : {failedJob.errorLog.slice(0, 500)}
          </p>
        )}
        <ul className="space-y-2">
          {project.jobs.slice(0, 12).map((j) => (
            <li key={j.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
              <span>
                {j.type} — {statusLabel(j.status)}
                {j.errorLog ? (
                  <span className="mt-0.5 block truncate text-xs text-[var(--danger)]">
                    {j.errorLog.slice(0, 120)}
                  </span>
                ) : null}
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

      <div
        className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--bg)] p-3"
        style={{ zIndex: 100 }}
      >
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            className="btn btn-primary min-h-14 w-full touch-manipulation text-base"
            onClick={() => void startGenerate()}
          >
            {generating
              ? "Traitement en cours…"
              : busy
                ? "Relancer analyse & génération"
                : "Lancer analyse & génération"}
          </button>
        </div>
      </div>
    </div>
  );
}
