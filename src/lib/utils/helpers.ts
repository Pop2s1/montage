import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Brouillon",
    pending: "En attente",
    importing: "Import en cours",
    analyzing: "Analyse en cours",
    transcribing: "Transcription en cours",
    generating: "Génération en cours",
    ready: "Montage prêt",
    exporting: "Export en cours",
    completed: "Terminé",
    failed: "Échoué",
    cancelled: "Annulé",
    uploading: "Import…",
    running: "En cours",
  };
  return map[status] ?? status;
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
