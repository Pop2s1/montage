import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/providers/storage/local";
import {
  detectSceneCuts,
  detectSilences,
  generateThumbnail,
  probeVideo,
} from "@/lib/video/ffmpeg";
import { getTranscriptionProvider } from "@/lib/providers/transcription";
import { getMontageProvider } from "@/lib/providers/montage";
import { enqueueJob, updateJobProgress } from "@/lib/queue/jobs";
import { buildSubtitlesFromSegments } from "@/lib/services/subtitles";
import { safeJsonParse } from "@/lib/utils/helpers";
import type { InterestingMoment, SilenceRange, TranscriptWord } from "@/types/domain";
import { getEnv } from "@/lib/config/env";
import path from "path";
import { promises as fs } from "fs";
import { exportTimeline, buildAssSubtitles } from "@/lib/video/ffmpeg";
import { randomBytes } from "crypto";

export async function processImportJob(jobId: string, projectId: string, payload: { videoId: string }) {
  const storage = getStorage();
  const video = await prisma.videoAsset.findFirst({
    where: { id: payload.videoId, projectId },
  });
  if (!video) throw new Error("Video not found");

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "importing" },
  });
  await updateJobProgress(jobId, 10);

  const abs = await storage.resolveLocalPath(video.storageKey);
  const probe = await probeVideo(abs);
  await updateJobProgress(jobId, 40);

  if (probe.durationSec > getEnv().MAX_VIDEO_DURATION_SEC) {
    throw new Error(`Vidéo trop longue (max ${getEnv().MAX_VIDEO_DURATION_SEC}s)`);
  }

  const thumbKey = path.join("thumbnails", projectId, `${video.id}.jpg`);
  const thumbAbs = storage.absolutePath(thumbKey);
  await generateThumbnail(abs, thumbAbs, Math.min(1, probe.durationSec / 2));
  await updateJobProgress(jobId, 70);

  const { sha256File } = await import("@/lib/providers/storage/local");
  const checksum = await sha256File(abs);

  await prisma.videoAsset.update({
    where: { id: video.id },
    data: {
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      thumbnailPath: thumbKey,
      checksum,
      status: "ready",
    },
  });

  await prisma.usageEvent.create({
    data: {
      userId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).userId,
      projectId,
      kind: "import_minutes",
      quantity: probe.durationSec / 60,
      unit: "minutes",
    },
  });

  await updateJobProgress(jobId, 90);
  await enqueueJob({ projectId, type: "analyze", payload: { videoId: video.id } });
}

export async function processAnalyzeJob(
  jobId: string,
  projectId: string,
  payload: { videoId: string },
) {
  const storage = getStorage();
  const video = await prisma.videoAsset.findFirstOrThrow({
    where: { id: payload.videoId, projectId },
  });

  await prisma.project.update({ where: { id: projectId }, data: { status: "analyzing" } });
  await updateJobProgress(jobId, 5);

  const abs = await storage.resolveLocalPath(video.storageKey);
  const silences = await detectSilences(abs);
  await updateJobProgress(jobId, 45);
  const scenes = await detectSceneCuts(abs);
  await updateJobProgress(jobId, 80);

  const duration = video.durationSec ?? 0;
  const silenceCoverage =
    silences.reduce((acc, s) => acc + (s.end - s.start), 0) / Math.max(1, duration);
  const audioScore = Math.max(0.2, 1 - silenceCoverage);
  const visualScore = scenes.length > 1 ? 0.75 : 0.55;
  const interesting = deriveInterestingMoments(silences, scenes, duration);

  await prisma.videoAnalysis.create({
    data: {
      projectId,
      videoId: video.id,
      status: "completed",
      silenceRanges: JSON.stringify(silences),
      sceneCuts: JSON.stringify(scenes),
      qualityScore: (audioScore + visualScore) / 2,
      audioScore,
      visualScore,
      interestingMoments: JSON.stringify(interesting),
      metadata: JSON.stringify({ sceneCount: scenes.length, silenceCount: silences.length }),
    },
  });

  await prisma.scene.deleteMany({ where: { videoId: video.id } });
  const sceneRows = [];
  for (let i = 0; i < scenes.length; i++) {
    const start = scenes[i]!;
    const end = i + 1 < scenes.length ? scenes[i + 1]! : duration;
    if (end <= start) continue;
    sceneRows.push({
      projectId,
      videoId: video.id,
      startSec: start,
      endSec: end,
      score: 0.5,
      kind: "scene",
      label: `Scène ${i + 1}`,
    });
  }
  if (sceneRows.length) await prisma.scene.createMany({ data: sceneRows });

  await prisma.usageEvent.create({
    data: {
      userId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).userId,
      projectId,
      kind: "analyzed_minutes",
      quantity: duration / 60,
      unit: "minutes",
    },
  });

  await enqueueJob({ projectId, type: "transcribe", payload: { videoId: video.id } });
}

export async function processTranscribeJob(
  jobId: string,
  projectId: string,
  payload: { videoId: string },
) {
  const storage = getStorage();
  const video = await prisma.videoAsset.findFirstOrThrow({
    where: { id: payload.videoId, projectId },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  await prisma.project.update({ where: { id: projectId }, data: { status: "transcribing" } });
  await updateJobProgress(jobId, 10);

  const provider = getTranscriptionProvider();
  const abs = await storage.resolveLocalPath(video.storageKey);
  const result = await provider.transcribe({
    filePath: abs,
    language: "fr",
    durationSec: video.durationSec ?? undefined,
  });
  await updateJobProgress(jobId, 80);

  await prisma.transcript.deleteMany({ where: { videoId: video.id } });
  await prisma.transcript.create({
    data: {
      projectId,
      videoId: video.id,
      language: result.language,
      fullText: result.fullText,
      wordsJson: JSON.stringify(result.words),
      provider: result.provider,
    },
  });

  await prisma.usageEvent.create({
    data: {
      userId: project.userId,
      projectId,
      kind: "transcribed_minutes",
      quantity: (video.durationSec ?? 0) / 60,
      unit: "minutes",
      metaJson: JSON.stringify({ provider: result.provider }),
    },
  });

  // When all videos of the project are transcribed, enqueue generate
  const videos = await prisma.videoAsset.findMany({ where: { projectId } });
  const transcripts = await prisma.transcript.findMany({ where: { projectId } });
  const ready =
    videos.length > 0 &&
    videos.every((v) => v.status === "ready") &&
    transcripts.length >= videos.length;

  if (ready) {
    const existing = await prisma.processingJob.findFirst({
      where: {
        projectId,
        type: "generate",
        status: { in: ["pending", "running", "completed"] },
      },
    });
    if (!existing) {
      await enqueueJob({ projectId, type: "generate", payload: {} });
    }
  }
}

export async function processGenerateJob(jobId: string, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      videos: true,
      analyses: true,
      transcripts: true,
      settings: true,
    },
  });

  await prisma.project.update({ where: { id: projectId }, data: { status: "generating" } });
  await updateJobProgress(jobId, 10);

  const videos = project.videos.map((v) => {
    const analysis = project.analyses.find((a) => a.videoId === v.id);
    const transcript = project.transcripts.find((t) => t.videoId === v.id);
    return {
      id: v.id,
      durationSec: v.durationSec ?? 0,
      words: safeJsonParse<TranscriptWord[]>(transcript?.wordsJson ?? "[]", []),
      silences: safeJsonParse<SilenceRange[]>(analysis?.silenceRanges ?? "[]", []),
      scenes: safeJsonParse<number[]>(analysis?.sceneCuts ?? "[]", [0]),
      interesting: safeJsonParse<InterestingMoment[]>(analysis?.interestingMoments ?? "[]", []),
    };
  });

  const provider = getMontageProvider();
  const result = await provider.generate({
    projectName: project.name,
    prompt: project.prompt ?? "",
    tone: project.tone,
    targetDurationSec: project.targetDurationSec,
    format: project.format,
    videos,
  });
  await updateJobProgress(jobId, 50);

  const variant = await prisma.variant.create({
    data: {
      projectId,
      name: "Version principale",
      style: project.tone ?? "dynamique",
      isPrimary: true,
    },
  });

  // Clear previous timelines for regeneration simplicity in MVP
  const oldTimelines = await prisma.timeline.findMany({ where: { projectId } });
  for (const t of oldTimelines) {
    await prisma.subtitleCue.deleteMany({ where: { timelineId: t.id } });
    await prisma.overlayText.deleteMany({ where: { timelineId: t.id } });
    await prisma.timelineSegment.deleteMany({ where: { timelineId: t.id } });
    await prisma.track.deleteMany({ where: { timelineId: t.id } });
  }
  await prisma.timeline.deleteMany({ where: { projectId } });

  let cursor = 0;
  const segmentData = result.segments.map((s, orderIndex) => {
    const durationSec = round2(s.sourceEndSec - s.sourceStartSec);
    const row = {
      videoId: s.videoId,
      trackType: "video",
      sourceStartSec: s.sourceStartSec,
      sourceEndSec: s.sourceEndSec,
      timelineStartSec: cursor,
      durationSec,
      spokenText: s.spokenText ?? null,
      selectionReason: s.selectionReason,
      relevanceScore: s.relevanceScore,
      segmentType: s.segmentType,
      orderIndex,
      cropJson: JSON.stringify({ x: 0.5, y: 0.5, w: 1, h: 1 }),
    };
    cursor = round2(cursor + durationSec);
    return row;
  });

  const timeline = await prisma.timeline.create({
    data: {
      projectId,
      variantId: variant.id,
      name: "Montage principal",
      durationSec: cursor,
      version: 1,
      snapshotJson: JSON.stringify({ segments: segmentData }),
      tracks: {
        create: [
          { type: "video", name: "Vidéo", orderIndex: 0 },
          { type: "audio", name: "Audio", orderIndex: 1 },
          { type: "subtitle", name: "Sous-titres", orderIndex: 2 },
          { type: "text", name: "Textes", orderIndex: 3 },
        ],
      },
      segments: { create: segmentData },
    },
  });

  const cues = buildSubtitlesFromSegments(
    segmentData.map((s) => ({
      timelineStartSec: s.timelineStartSec,
      durationSec: s.durationSec,
      sourceStartSec: s.sourceStartSec,
      spokenText: s.spokenText,
      videoId: s.videoId ?? "",
    })),
    videos.map((v) => ({ id: v.id, words: v.words })),
  );

  if (cues.length) {
    await prisma.subtitleCue.createMany({
      data: cues.map((c, orderIndex) => ({
        timelineId: timeline.id,
        startSec: c.startSec,
        endSec: c.endSec,
        text: c.text,
        wordsJson: JSON.stringify(c.words),
        style: result.subtitleStyle,
        position: "bottom",
        orderIndex,
      })),
    });
  }

  await prisma.overlayText.createMany({
    data: [
      {
        timelineId: timeline.id,
        kind: "hook",
        text: result.editorial.hook,
        startSec: 0,
        endSec: Math.min(3, cursor),
        styleJson: JSON.stringify({ position: "top" }),
      },
      {
        timelineId: timeline.id,
        kind: "cta",
        text: result.editorial.cta,
        startSec: Math.max(0, cursor - 4),
        endSec: cursor,
        styleJson: JSON.stringify({ position: "center" }),
      },
    ],
  });

  await prisma.editorialContent.upsert({
    where: { projectId },
    create: {
      projectId,
      hook: result.editorial.hook,
      cta: result.editorial.cta,
      publishTitle: result.editorial.publishTitle,
      description: result.editorial.description,
      instagramCaption: result.editorial.instagramCaption,
      youtubeDescription: result.editorial.youtubeDescription,
      hashtagsJson: JSON.stringify(result.editorial.hashtags),
      coverText: result.editorial.coverText,
      keywordsJson: JSON.stringify(result.editorial.keywords),
      midTitlesJson: JSON.stringify(result.editorial.midTitles),
      variantsJson: JSON.stringify(result.editorial.variants),
    },
    update: {
      hook: result.editorial.hook,
      cta: result.editorial.cta,
      publishTitle: result.editorial.publishTitle,
      description: result.editorial.description,
      instagramCaption: result.editorial.instagramCaption,
      youtubeDescription: result.editorial.youtubeDescription,
      hashtagsJson: JSON.stringify(result.editorial.hashtags),
      coverText: result.editorial.coverText,
      keywordsJson: JSON.stringify(result.editorial.keywords),
      midTitlesJson: JSON.stringify(result.editorial.midTitles),
      variantsJson: JSON.stringify(result.editorial.variants),
    },
  });

  await prisma.projectSettings.upsert({
    where: { projectId },
    create: {
      projectId,
      subtitleStyle: result.subtitleStyle,
    },
    update: { subtitleStyle: result.subtitleStyle },
  });

  // Project thumbnail from first video
  const firstVideo = project.videos[0];
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "ready",
      thumbnailPath: firstVideo?.thumbnailPath ?? null,
    },
  });

  await updateJobProgress(jobId, 100);
}

export async function processExportJob(
  jobId: string,
  projectId: string,
  payload: { exportId: string },
) {
  const storage = getStorage();
  const exportJob = await prisma.exportJob.findFirstOrThrow({
    where: { id: payload.exportId, projectId },
  });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { settings: true },
  });
  const timeline = await prisma.timeline.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { segments: { orderBy: { orderIndex: "asc" } }, subtitles: { orderBy: { orderIndex: "asc" } } },
  });
  if (!timeline || timeline.segments.length === 0) throw new Error("Aucune timeline à exporter");

  await prisma.project.update({ where: { id: projectId }, data: { status: "exporting" } });
  await prisma.exportJob.update({
    where: { id: exportJob.id },
    data: { status: "running", progress: 5 },
  });

  const videos = await prisma.videoAsset.findMany({ where: { projectId } });
  const videoMap = new Map(videos.map((v) => [v.id, v]));

  const cuts = [];
  for (const s of timeline.segments.filter((seg) => seg.videoId)) {
    const v = videoMap.get(s.videoId!);
    if (!v) throw new Error("Vidéo source manquante");
    cuts.push({
      inputPath: await storage.resolveLocalPath(v.storageKey),
      startSec: s.sourceStartSec,
      endSec: s.sourceEndSec,
    });
  }

  let subtitleAssPath: string | undefined;
  if (exportJob.burnSubtitles && timeline.subtitles.length) {
    const ass = buildAssSubtitles(
      timeline.subtitles.map((c) => ({
        startSec: c.startSec,
        endSec: c.endSec,
        text: c.text,
      })),
      project.settings?.subtitleStyle ?? "modern_bold",
      exportJob.width,
      exportJob.height,
    );
    subtitleAssPath = storage.absolutePath(path.join("temp", `${exportJob.id}.ass`));
    await fs.mkdir(path.dirname(subtitleAssPath), { recursive: true });
    await fs.writeFile(subtitleAssPath, ass, "utf8");
  }

  const outputKey = await storage.createExportKey(projectId, exportJob.id);
  const outputPath = storage.absolutePath(outputKey);

  await exportTimeline({
    cuts,
    outputPath,
    width: exportJob.width,
    height: exportJob.height,
    fps: exportJob.fps,
    subtitleAssPath,
    onProgress: async (pct) => {
      await updateJobProgress(jobId, pct);
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: { progress: pct },
      });
    },
  });

  const stat = await fs.stat(outputPath);
  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + getEnv().DOWNLOAD_TOKEN_TTL_SEC * 1000);

  await prisma.exportJob.update({
    where: { id: exportJob.id },
    data: {
      status: "completed",
      progress: 100,
      outputKey,
      actualBytes: stat.size,
      downloadToken: token,
      downloadExpiresAt: expires,
    },
  });

  await prisma.usageEvent.create({
    data: {
      userId: project.userId,
      projectId,
      kind: "export",
      quantity: 1,
      unit: "count",
      metaJson: JSON.stringify({ bytes: stat.size }),
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "completed" },
  });

  if (subtitleAssPath) await fs.unlink(subtitleAssPath).catch(() => undefined);
}

function deriveInterestingMoments(
  silences: SilenceRange[],
  scenes: number[],
  duration: number,
): InterestingMoment[] {
  const moments: InterestingMoment[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const start = scenes[i]!;
    const end = Math.min(duration, start + 3);
    const inSilence = silences.some((s) => start >= s.start && start <= s.end);
    moments.push({
      start,
      end,
      score: inSilence ? 0.3 : 0.7,
      reason: inSilence ? "Changement de plan (silence)" : "Changement de plan actif",
    });
  }
  return moments.slice(0, 20);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
