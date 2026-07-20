"use client";

import { create } from "zustand";

export interface EditorSegment {
  id: string;
  videoId: string | null;
  sourceStartSec: number;
  sourceEndSec: number;
  timelineStartSec: number;
  durationSec: number;
  spokenText?: string | null;
  selectionReason?: string | null;
  relevanceScore: number;
  segmentType: string;
  orderIndex: number;
}

export interface EditorSubtitle {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  style: string;
}

export interface EditorOverlay {
  id: string;
  kind: string;
  text: string;
  startSec: number;
  endSec: number;
}

interface EditorState {
  timelineId: string | null;
  segments: EditorSegment[];
  subtitles: EditorSubtitle[];
  overlays: EditorOverlay[];
  currentTime: number;
  playing: boolean;
  selectedSegmentId: string | null;
  selectedSubtitleId: string | null;
  duration: number;
  dirty: boolean;
  past: string[];
  future: string[];
  setFromServer: (data: {
    timelineId: string;
    segments: EditorSegment[];
    subtitles: EditorSubtitle[];
    overlays: EditorOverlay[];
    duration: number;
  }) => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  selectSegment: (id: string | null) => void;
  selectSubtitle: (id: string | null) => void;
  updateSubtitleText: (id: string, text: string) => void;
  trimSegment: (id: string, sourceStartSec: number, sourceEndSec: number) => void;
  removeSegment: (id: string) => void;
  moveSegment: (id: string, direction: -1 | 1) => void;
  splitSegment: (id: string, atTimelineSec: number) => void;
  updateOverlayText: (id: string, text: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  snapshot: () => string;
}

function recompute(segments: EditorSegment[]): EditorSegment[] {
  let cursor = 0;
  return segments
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s, i) => {
      const durationSec = Math.max(0.1, s.sourceEndSec - s.sourceStartSec);
      const next = {
        ...s,
        orderIndex: i,
        durationSec,
        timelineStartSec: cursor,
      };
      cursor = Math.round((cursor + durationSec) * 100) / 100;
      return next;
    });
}

export const useEditorStore = create<EditorState>((set, get) => ({
  timelineId: null,
  segments: [],
  subtitles: [],
  overlays: [],
  currentTime: 0,
  playing: false,
  selectedSegmentId: null,
  selectedSubtitleId: null,
  duration: 0,
  dirty: false,
  past: [],
  future: [],

  snapshot: () =>
    JSON.stringify({
      segments: get().segments,
      subtitles: get().subtitles,
      overlays: get().overlays,
    }),

  setFromServer: (data) =>
    set({
      timelineId: data.timelineId,
      segments: data.segments,
      subtitles: data.subtitles,
      overlays: data.overlays,
      duration: data.duration,
      dirty: false,
      past: [],
      future: [],
    }),

  setCurrentTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ playing: p }),
  selectSegment: (id) => set({ selectedSegmentId: id, selectedSubtitleId: null }),
  selectSubtitle: (id) => set({ selectedSubtitleId: id, selectedSegmentId: null }),

  updateSubtitleText: (id, text) => {
    const snap = get().snapshot();
    set((s) => ({
      past: [...s.past, snap].slice(-40),
      future: [],
      dirty: true,
      subtitles: s.subtitles.map((c) => (c.id === id ? { ...c, text } : c)),
    }));
  },

  trimSegment: (id, sourceStartSec, sourceEndSec) => {
    const snap = get().snapshot();
    set((s) => {
      const segments = recompute(
        s.segments.map((seg) =>
          seg.id === id
            ? {
                ...seg,
                sourceStartSec: Math.min(sourceStartSec, sourceEndSec - 0.1),
                sourceEndSec: Math.max(sourceEndSec, sourceStartSec + 0.1),
              }
            : seg,
        ),
      );
      return {
        past: [...s.past, snap].slice(-40),
        future: [],
        dirty: true,
        segments,
        duration: segments.reduce((a, b) => a + b.durationSec, 0),
      };
    });
  },

  removeSegment: (id) => {
    const snap = get().snapshot();
    set((s) => {
      const segments = recompute(s.segments.filter((seg) => seg.id !== id));
      return {
        past: [...s.past, snap].slice(-40),
        future: [],
        dirty: true,
        segments,
        selectedSegmentId: null,
        duration: segments.reduce((a, b) => a + b.durationSec, 0),
      };
    });
  },

  moveSegment: (id, direction) => {
    const snap = get().snapshot();
    set((s) => {
      const list = s.segments.slice().sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = list.findIndex((x) => x.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= list.length) return s;
      const tmp = list[idx]!;
      list[idx] = list[target]!;
      list[target] = tmp;
      const segments = recompute(list.map((x, i) => ({ ...x, orderIndex: i })));
      return {
        past: [...s.past, snap].slice(-40),
        future: [],
        dirty: true,
        segments,
        duration: segments.reduce((a, b) => a + b.durationSec, 0),
      };
    });
  },

  splitSegment: (id, atTimelineSec) => {
    const snap = get().snapshot();
    set((s) => {
      const seg = s.segments.find((x) => x.id === id);
      if (!seg) return s;
      const local = atTimelineSec - seg.timelineStartSec;
      if (local < 0.3 || local > seg.durationSec - 0.3) return s;
      const cutSource = seg.sourceStartSec + local;
      const left = {
        ...seg,
        sourceEndSec: cutSource,
      };
      const right = {
        ...seg,
        id: `${seg.id}-split-${Date.now()}`,
        sourceStartSec: cutSource,
        orderIndex: seg.orderIndex + 0.5,
      };
      const segments = recompute(
        s.segments.flatMap((x) => (x.id === id ? [left, right] : [x])),
      );
      return {
        past: [...s.past, snap].slice(-40),
        future: [],
        dirty: true,
        segments,
        duration: segments.reduce((a, b) => a + b.durationSec, 0),
      };
    });
  },

  updateOverlayText: (id, text) => {
    const snap = get().snapshot();
    set((s) => ({
      past: [...s.past, snap].slice(-40),
      future: [],
      dirty: true,
      overlays: s.overlays.map((o) => (o.id === id ? { ...o, text } : o)),
    }));
  },

  undo: () => {
    const { past, snapshot } = get();
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    const current = snapshot();
    const parsed = JSON.parse(prev) as {
      segments: EditorSegment[];
      subtitles: EditorSubtitle[];
      overlays: EditorOverlay[];
    };
    set({
      past: past.slice(0, -1),
      future: [...get().future, current],
      segments: parsed.segments,
      subtitles: parsed.subtitles,
      overlays: parsed.overlays,
      dirty: true,
      duration: parsed.segments.reduce((a, b) => a + b.durationSec, 0),
    });
  },

  redo: () => {
    const { future, snapshot } = get();
    if (!future.length) return;
    const next = future[future.length - 1]!;
    const current = snapshot();
    const parsed = JSON.parse(next) as {
      segments: EditorSegment[];
      subtitles: EditorSubtitle[];
      overlays: EditorOverlay[];
    };
    set({
      future: future.slice(0, -1),
      past: [...get().past, current],
      segments: parsed.segments,
      subtitles: parsed.subtitles,
      overlays: parsed.overlays,
      dirty: true,
      duration: parsed.segments.reduce((a, b) => a + b.durationSec, 0),
    });
  },

  markSaved: () => set({ dirty: false }),
}));
