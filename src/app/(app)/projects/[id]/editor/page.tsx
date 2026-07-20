"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEditorStore } from "@/components/editor/store";
import { formatDuration } from "@/lib/utils/helpers";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const videoRef = useRef<HTMLVideoElement>(null);
  const store = useEditorStore();

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    const timeline = data.project?.timelines?.[0];
    if (!timeline) return;
    useEditorStore.getState().setFromServer({
      timelineId: timeline.id,
      duration: timeline.durationSec,
      segments: timeline.segments,
      subtitles: timeline.subtitles,
      overlays: timeline.texts,
    });
  }, [id]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(boot);
  }, [load]);

  // Autosave
  useEffect(() => {
    if (!store.dirty || !store.timelineId) return;
    const timelineId = store.timelineId;
    const segments = store.segments;
    const subtitles = store.subtitles;
    const overlays = store.overlays;
    const t = setTimeout(async () => {
      await fetch(`/api/projects/${id}/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timelineId,
          reorderSegmentIds: segments.map((s) => s.id),
          segments: segments.map((s) => ({
            id: s.id,
            sourceStartSec: s.sourceStartSec,
            sourceEndSec: s.sourceEndSec,
            orderIndex: s.orderIndex,
          })),
          subtitles: subtitles.map((c) => ({
            id: c.id,
            text: c.text,
            startSec: c.startSec,
            endSec: c.endSec,
          })),
          overlayTexts: overlays.map((o) => ({ id: o.id, text: o.text })),
        }),
      });
      useEditorStore.getState().markSaved();
    }, 900);
    return () => clearTimeout(t);
  }, [store.dirty, store.segments, store.subtitles, store.overlays, store.timelineId, id]);

  const activeSegment = useMemo(() => {
    return store.segments.find(
      (s) =>
        store.currentTime >= s.timelineStartSec &&
        store.currentTime < s.timelineStartSec + s.durationSec,
    );
  }, [store.segments, store.currentTime]);

  const activeCue = useMemo(() => {
    return store.subtitles.find(
      (c) => store.currentTime >= c.startSec && store.currentTime < c.endSec,
    );
  }, [store.subtitles, store.currentTime]);

  const activeOverlay = useMemo(() => {
    return store.overlays.find(
      (o) => store.currentTime >= o.startSec && store.currentTime < o.endSec,
    );
  }, [store.overlays, store.currentTime]);

  // Sync HTML video source to active segment
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeSegment?.videoId) return;
    const src = `/api/projects/${id}/media/${activeSegment.videoId}`;
    const localTime = store.currentTime - activeSegment.timelineStartSec + activeSegment.sourceStartSec;
    if (!el.src.includes(activeSegment.videoId)) {
      el.src = src;
      el.currentTime = localTime;
      if (store.playing) void el.play().catch(() => undefined);
    } else if (Math.abs(el.currentTime - localTime) > 0.35) {
      el.currentTime = localTime;
    }
  }, [activeSegment, id, store.currentTime, store.playing]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (store.playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [store.playing]);

  // Playback clock
  useEffect(() => {
    if (!store.playing) return;
    const iv = setInterval(() => {
      const next = store.currentTime + 0.1;
      if (next >= store.duration) {
        store.setPlaying(false);
        store.setCurrentTime(store.duration);
      } else {
        store.setCurrentTime(Math.round(next * 10) / 10);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [store.playing, store.currentTime, store.duration, store]);

  const selected = store.segments.find((s) => s.id === store.selectedSegmentId);

  return (
    <div className="-mx-6 -mt-8 min-h-[calc(100vh-4rem)] bg-[#0c0f14] px-4 py-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="btn btn-ghost py-1.5 text-sm">
            ← Projet
          </Link>
          <h1 className="font-display text-xl font-bold">Éditeur</h1>
          {store.dirty ? (
            <span className="badge animate-pulse-soft">Enregistrement…</span>
          ) : (
            <span className="badge">Sauvegardé</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost py-1.5 text-sm" onClick={() => store.undo()}>
            Annuler
          </button>
          <button type="button" className="btn btn-ghost py-1.5 text-sm" onClick={() => store.redo()}>
            Rétablir
          </button>
          <Link href={`/projects/${id}/export`} className="btn btn-primary py-1.5 text-sm">
            Exporter
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="relative mx-auto aspect-[9/16] max-h-[58vh] max-w-sm overflow-hidden rounded-xl border border-[var(--line)] bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={false} />
            {/* Safe zones for vertical */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[12%] bg-gradient-to-b from-black/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black/45 to-transparent" />
            {activeOverlay && (
              <div className="pointer-events-none absolute inset-x-4 top-[10%] text-center">
                <p className="font-display text-2xl font-bold drop-shadow-lg">{activeOverlay.text}</p>
              </div>
            )}
            {activeCue && (
              <div className="pointer-events-none absolute inset-x-6 bottom-[14%] text-center">
                <p className="inline-block rounded bg-black/55 px-3 py-1.5 text-lg font-bold leading-tight">
                  {activeCue.text}
                </p>
              </div>
            )}
          </div>

          <div className="surface rounded-xl p-3">
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary py-1.5"
                onClick={() => store.setPlaying(!store.playing)}
              >
                {store.playing ? "Pause" : "Lecture"}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(store.duration, 0.1)}
                step={0.1}
                value={store.currentTime}
                onChange={(e) => store.setCurrentTime(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-24 text-right text-sm text-[var(--muted)]">
                {formatDuration(store.currentTime)} / {formatDuration(store.duration)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <div className="relative flex min-w-full gap-1 pb-2" style={{ minWidth: `${Math.max(store.duration * 24, 400)}px` }}>
                {store.segments.map((s) => {
                  const width = Math.max(48, s.durationSec * 24);
                  const active = s.id === store.selectedSegmentId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        store.selectSegment(s.id);
                        store.setCurrentTime(s.timelineStartSec);
                      }}
                      className="rounded-md border px-2 py-3 text-left text-xs"
                      style={{
                        width,
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background:
                          s.segmentType === "introduction"
                            ? "rgba(232,164,90,0.2)"
                            : s.segmentType === "conclusion"
                              ? "rgba(122,167,217,0.2)"
                              : s.segmentType === "illustration"
                                ? "rgba(111,191,138,0.15)"
                                : "var(--bg-soft)",
                      }}
                      title={s.selectionReason ?? s.segmentType}
                    >
                      <div className="truncate font-medium">{s.segmentType}</div>
                      <div className="truncate text-[var(--muted)]">{formatDuration(s.durationSec)}</div>
                    </button>
                  );
                })}
                <div
                  className="pointer-events-none absolute top-0 bottom-2 w-0.5 bg-[var(--accent)]"
                  style={{ left: store.currentTime * 24 }}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {store.subtitles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="badge max-w-[12rem] truncate"
                  style={{
                    borderColor:
                      store.selectedSubtitleId === c.id ? "var(--accent)" : "var(--line)",
                  }}
                  onClick={() => {
                    store.selectSubtitle(c.id);
                    store.setCurrentTime(c.startSec);
                  }}
                >
                  {c.text}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="surface h-fit space-y-4 rounded-xl p-4">
          <h2 className="font-display font-semibold">Inspecteur</h2>
          {selected ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-[var(--muted)]">Type :</span> {selected.segmentType}
              </p>
              <p>
                <span className="text-[var(--muted)]">Score :</span>{" "}
                {(selected.relevanceScore * 100).toFixed(0)}%
              </p>
              <p className="text-[var(--muted)]">{selected.selectionReason}</p>
              {selected.spokenText && <p className="rounded bg-black/30 p-2">{selected.spokenText}</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[var(--muted)]">
                  In
                  <input
                    className="input mt-1"
                    type="number"
                    step={0.1}
                    value={selected.sourceStartSec}
                    onChange={(e) =>
                      store.trimSegment(selected.id, Number(e.target.value), selected.sourceEndSec)
                    }
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Out
                  <input
                    className="input mt-1"
                    type="number"
                    step={0.1}
                    value={selected.sourceEndSec}
                    onChange={(e) =>
                      store.trimSegment(selected.id, selected.sourceStartSec, Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => store.moveSegment(selected.id, -1)}>
                  ←
                </button>
                <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => store.moveSegment(selected.id, 1)}>
                  →
                </button>
                <button
                  type="button"
                  className="btn btn-ghost py-1.5 text-xs"
                  onClick={() => store.splitSegment(selected.id, store.currentTime)}
                >
                  Diviser
                </button>
                <button
                  type="button"
                  className="btn btn-ghost py-1.5 text-xs"
                  onClick={() => store.removeSegment(selected.id)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : store.selectedSubtitleId ? (
            <div>
              <label className="label">Sous-titre</label>
              <textarea
                className="input min-h-24"
                value={store.subtitles.find((c) => c.id === store.selectedSubtitleId)?.text ?? ""}
                onChange={(e) => store.updateSubtitleText(store.selectedSubtitleId!, e.target.value)}
              />
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Sélectionnez un clip ou un sous-titre.</p>
          )}

          <div className="border-t border-[var(--line)] pt-3">
            <h3 className="mb-2 text-sm font-medium">Textes</h3>
            {store.overlays.map((o) => (
              <label key={o.id} className="mb-2 block text-xs text-[var(--muted)]">
                {o.kind}
                <input
                  className="input mt-1"
                  value={o.text}
                  onChange={(e) => store.updateOverlayText(o.id, e.target.value)}
                />
              </label>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
