-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_limits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxImportMinutesPerMonth" INTEGER NOT NULL DEFAULT 120,
    "maxStorageBytes" INTEGER NOT NULL DEFAULT 2147483647,
    "maxExportsPerMonth" INTEGER NOT NULL DEFAULT 20,
    "maxProjects" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "account_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" TEXT NOT NULL DEFAULT 'instagram_reel',
    "customWidth" INTEGER,
    "customHeight" INTEGER,
    "targetDurationSec" INTEGER NOT NULL DEFAULT 45,
    "tone" TEXT,
    "prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "thumbnailPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_settings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subtitleStyle" TEXT NOT NULL DEFAULT 'modern_bold',
    "subtitlePosition" TEXT NOT NULL DEFAULT 'bottom',
    "subtitleFontSize" INTEGER NOT NULL DEFAULT 48,
    "burnSubtitles" BOOLEAN NOT NULL DEFAULT true,
    "autoSave" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'fr',

    CONSTRAINT "project_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "thumbnailPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_analyses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "silenceRanges" TEXT NOT NULL DEFAULT '[]',
    "sceneCuts" TEXT NOT NULL DEFAULT '[]',
    "qualityScore" DOUBLE PRECISION,
    "audioScore" DOUBLE PRECISION,
    "visualScore" DOUBLE PRECISION,
    "blurryRanges" TEXT NOT NULL DEFAULT '[]',
    "interestingMoments" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "fullText" TEXT NOT NULL DEFAULT '',
    "wordsJson" TEXT NOT NULL DEFAULT '[]',
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'scene',
    "label" TEXT,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timelines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Montage principal',
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_segments" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "videoId" TEXT,
    "trackType" TEXT NOT NULL DEFAULT 'video',
    "sourceStartSec" DOUBLE PRECISION NOT NULL,
    "sourceEndSec" DOUBLE PRECISION NOT NULL,
    "timelineStartSec" DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "spokenText" TEXT,
    "selectionReason" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "segmentType" TEXT NOT NULL DEFAULT 'dialogue',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "cropJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "timeline_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtitle_cues" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "wordsJson" TEXT NOT NULL DEFAULT '[]',
    "style" TEXT NOT NULL DEFAULT 'modern_bold',
    "position" TEXT NOT NULL DEFAULT 'bottom',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subtitle_cues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overlay_texts" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "styleJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "overlay_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_contents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hook" TEXT,
    "midTitlesJson" TEXT NOT NULL DEFAULT '[]',
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',
    "cta" TEXT,
    "publishTitle" TEXT,
    "description" TEXT,
    "instagramCaption" TEXT,
    "youtubeDescription" TEXT,
    "hashtagsJson" TEXT NOT NULL DEFAULT '[]',
    "coverText" TEXT,
    "variantsJson" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "editorial_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "variantId" TEXT,
    "format" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "quality" TEXT NOT NULL DEFAULT 'high',
    "burnSubtitles" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputKey" TEXT,
    "estimatedBytes" INTEGER,
    "actualBytes" INTEGER,
    "errorMessage" TEXT,
    "downloadToken" TEXT,
    "downloadExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "errorLog" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_limits_userId_key" ON "account_limits"("userId");

-- CreateIndex
CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_settings_projectId_key" ON "project_settings"("projectId");

-- CreateIndex
CREATE INDEX "video_assets_projectId_idx" ON "video_assets"("projectId");

-- CreateIndex
CREATE INDEX "video_analyses_projectId_videoId_idx" ON "video_analyses"("projectId", "videoId");

-- CreateIndex
CREATE INDEX "transcripts_projectId_videoId_idx" ON "transcripts"("projectId", "videoId");

-- CreateIndex
CREATE INDEX "scenes_projectId_videoId_idx" ON "scenes"("projectId", "videoId");

-- CreateIndex
CREATE INDEX "variants_projectId_idx" ON "variants"("projectId");

-- CreateIndex
CREATE INDEX "timelines_projectId_idx" ON "timelines"("projectId");

-- CreateIndex
CREATE INDEX "tracks_timelineId_idx" ON "tracks"("timelineId");

-- CreateIndex
CREATE INDEX "timeline_segments_timelineId_orderIndex_idx" ON "timeline_segments"("timelineId", "orderIndex");

-- CreateIndex
CREATE INDEX "subtitle_cues_timelineId_idx" ON "subtitle_cues"("timelineId");

-- CreateIndex
CREATE INDEX "overlay_texts_timelineId_idx" ON "overlay_texts"("timelineId");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_contents_projectId_key" ON "editorial_contents"("projectId");

-- CreateIndex
CREATE INDEX "export_jobs_projectId_idx" ON "export_jobs"("projectId");

-- CreateIndex
CREATE INDEX "processing_jobs_status_createdAt_idx" ON "processing_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "processing_jobs_projectId_idx" ON "processing_jobs"("projectId");

-- CreateIndex
CREATE INDEX "usage_events_userId_kind_createdAt_idx" ON "usage_events"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "account_limits" ADD CONSTRAINT "account_limits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timelines" ADD CONSTRAINT "timelines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timelines" ADD CONSTRAINT "timelines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_segments" ADD CONSTRAINT "timeline_segments_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_segments" ADD CONSTRAINT "timeline_segments_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle_cues" ADD CONSTRAINT "subtitle_cues_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overlay_texts" ADD CONSTRAINT "overlay_texts_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_contents" ADD CONSTRAINT "editorial_contents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
