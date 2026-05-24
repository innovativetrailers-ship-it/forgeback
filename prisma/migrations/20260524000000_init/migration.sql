Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FREE', 'PRO', 'STUDIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATE', 'REPAINT', 'RELIGHT', 'UPSCALE', 'EXPORT', 'LORA_TRAIN', 'LIPSYNC', 'AUTO_SOCIAL', 'TRANSCRIBE', 'CGI_INSERT', 'AVATAR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('MAPILLARY', 'CESIUM', 'OSM_FALLBACK', 'USER_UPLOAD');

-- CreateEnum
CREATE TYPE "LoraStatus" AS ENUM ('PENDING', 'TRAINING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "FilmType" AS ENUM ('FEATURE_FILM', 'SHORT_FILM', 'DOCUMENTARY', 'MUSIC_VIDEO', 'COMMERCIAL', 'EXPERIMENTAL');

-- CreateEnum
CREATE TYPE "FilmStatus" AS ENUM ('DEVELOPMENT', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'COMPLETE', 'RELEASED');

-- CreateEnum
CREATE TYPE "SeriesType" AS ENUM ('TV_DRAMA', 'TV_COMEDY', 'WEB_SERIES', 'SOCIAL_SERIES', 'DOCUMENTARY_SERIES', 'ANTHOLOGY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'FREE',
    "creditBalance" INTEGER NOT NULL DEFAULT 50,
    "totalGenerated" INTEGER NOT NULL DEFAULT 0,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Project',
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "timelineJson" JSONB,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fps" INTEGER NOT NULL DEFAULT 24,
    "resolution" TEXT NOT NULL DEFAULT '1920x1080',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultCharacter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceUrls" TEXT[],
    "faceEmbedding" JSONB,
    "loraModelId" TEXT,
    "loraStatus" "LoraStatus" NOT NULL DEFAULT 'PENDING',
    "modelFamily" TEXT,
    "voiceId" TEXT,
    "voiceProvider" TEXT,
    "motionRefUrl" TEXT,
    "renderCount" INTEGER NOT NULL DEFAULT 0,
    "styleJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "LocationSource" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "hdriUrl" TEXT,
    "depthMapUrl" TEXT,
    "referenceUrls" TEXT[],
    "metaJson" JSONB,
    "generativePrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "modelUsed" TEXT,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "inputPayload" JSONB NOT NULL,
    "outputUrl" TEXT,
    "outputUrls" TEXT[],
    "proxyUrl" TEXT,
    "errorMessage" TEXT,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "jobId" TEXT,
    "stripeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originalUrl" TEXT,
    "instruction" TEXT,
    "regeneratedUrl" TEXT,
    "promptVariants" JSONB,
    "selectedVariantIdx" INTEGER,
    "metadata" JSONB,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RLHFLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "modelOptions" JSONB NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "selectedIdx" INTEGER NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RLHFLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "userId" TEXT,
    "jobId" TEXT,
    "costCents" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "voiceId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "allowDownload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "reviewLinkId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "timecode" DOUBLE PRECISION NOT NULL,
    "clipId" TEXT,
    "text" TEXT NOT NULL,
    "annotationData" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "fontFamily" TEXT NOT NULL,
    "logoUrl" TEXT,
    "introClipUrl" TEXT,
    "outroClipUrl" TEXT,
    "lowerThirdStyle" JSONB NOT NULL,
    "watermarkUrl" TEXT,
    "watermarkPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "watermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "faceReferenceUrls" TEXT[],
    "loraModelId" TEXT,
    "loraStatus" TEXT NOT NULL DEFAULT 'pending',
    "lockedModelFamily" TEXT,
    "baseAppearance" JSONB NOT NULL,
    "costumesByScene" JSONB NOT NULL DEFAULT '{}',
    "makeupState" JSONB NOT NULL,
    "makeupByScene" JSONB NOT NULL DEFAULT '{}',
    "voiceId" TEXT,
    "voiceProvider" TEXT NOT NULL DEFAULT 'elevenlabs',
    "voiceCharacteristics" JSONB NOT NULL DEFAULT '{}',
    "appearsInScenes" TEXT[],
    "totalScreenTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relationshipsTo" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CastMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "FilmType" NOT NULL,
    "logline" TEXT,
    "synopsis" TEXT,
    "genre" TEXT[],
    "targetRuntime" INTEGER NOT NULL,
    "rating" TEXT,
    "status" "FilmStatus" NOT NULL DEFAULT 'DEVELOPMENT',
    "colourPalette" JSONB,
    "cinematicStyle" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '2.39:1',
    "soundDesignNotes" TEXT,
    "musicStyle" TEXT,
    "finalVideoUrl" TEXT,
    "exportStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilmProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "filmProjectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmScene" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "sceneNumber" TEXT NOT NULL,
    "intExt" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "actionLines" TEXT NOT NULL,
    "dialogue" JSONB NOT NULL,
    "characterIds" TEXT[],
    "locationId" TEXT,
    "shotList" JSONB,
    "generatedClips" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'scripted',
    "productionNotes" TEXT,

    CONSTRAINT "FilmScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmCastMember" (
    "id" TEXT NOT NULL,
    "filmProjectId" TEXT NOT NULL,
    "vaultCharacterId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "actorNotes" TEXT,

    CONSTRAINT "FilmCastMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmLocation" (
    "id" TEXT NOT NULL,
    "filmProjectId" TEXT NOT NULL,
    "vaultLocationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "FilmLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "SeriesType" NOT NULL,
    "platform" TEXT NOT NULL,
    "episodeFormat" JSONB NOT NULL,
    "seriesBible" JSONB NOT NULL,
    "recurringCastIds" TEXT[],
    "recurringLocationIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'development',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "title" TEXT,
    "seasonArc" TEXT,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT,
    "previouslyOn" TEXT,
    "coldOpen" TEXT,
    "actBreaks" JSONB NOT NULL,
    "sceneIds" TEXT[],
    "tags" TEXT[],
    "targetRuntime" INTEGER NOT NULL,
    "finalVideoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBin" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#00e5c8',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MediaBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinClipEntry" (
    "id" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "clipUrl" TEXT NOT NULL,
    "proxyUrl" TEXT,
    "name" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "thumbnailUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BinClipEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingDecision" (
    "id" TEXT NOT NULL,
    "sceneCategory" TEXT NOT NULL,
    "assignedEngine" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "neededRepaint" BOOLEAN NOT NULL DEFAULT false,
    "creditsCost" INTEGER NOT NULL,
    "generationMs" INTEGER,
    "segmentCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnginePerformanceLog" (
    "id" TEXT NOT NULL,
    "engineId" TEXT NOT NULL,
    "sceneCategory" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "costCents" DOUBLE PRECISION NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnginePerformanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlendQualityLog" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "engineIds" TEXT[],
    "stitchCount" INTEGER NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "repaintNeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlendQualityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeResult" (
    "id" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "engineId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "issues" TEXT[],
    "strengths" TEXT[],
    "assessmentJson" JSONB NOT NULL,
    "tierUsed" TEXT NOT NULL,
    "generationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelReport" (
    "id" TEXT NOT NULL,
    "engineId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "probeCount" INTEGER NOT NULL,
    "isDelta" BOOLEAN NOT NULL DEFAULT false,
    "previousReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelUpdate" (
    "id" TEXT NOT NULL,
    "engineId" TEXT NOT NULL,
    "previousVersion" TEXT NOT NULL,
    "newVersion" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "probesRun" INTEGER NOT NULL DEFAULT 0,
    "trainingSignalsExtracted" INTEGER NOT NULL DEFAULT 0,
    "routingUpdated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModelUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSignal" (
    "id" TEXT NOT NULL,
    "sourceEngine" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "failureDescription" TEXT,
    "category" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "VaultCharacter_projectId_idx" ON "VaultCharacter"("projectId");

-- CreateIndex
CREATE INDEX "RenderJob_userId_status_idx" ON "RenderJob"("userId", "status");

-- CreateIndex
CREATE INDEX "RenderJob_projectId_idx" ON "RenderJob"("projectId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE INDEX "TrainingData_isProcessed_idx" ON "TrainingData"("isProcessed");

-- CreateIndex
CREATE INDEX "ApiUsageLog_provider_createdAt_idx" ON "ApiUsageLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "Avatar_userId_idx" ON "Avatar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLink_token_key" ON "ReviewLink"("token");

-- CreateIndex
CREATE INDEX "ReviewLink_token_idx" ON "ReviewLink"("token");

-- CreateIndex
CREATE INDEX "ReviewLink_userId_idx" ON "ReviewLink"("userId");

-- CreateIndex
CREATE INDEX "ReviewComment_reviewLinkId_idx" ON "ReviewComment"("reviewLinkId");

-- CreateIndex
CREATE INDEX "BrandKit_userId_idx" ON "BrandKit"("userId");

-- CreateIndex
CREATE INDEX "CastMember_projectId_idx" ON "CastMember"("projectId");

-- CreateIndex
CREATE INDEX "FilmProject_userId_idx" ON "FilmProject"("userId");

-- CreateIndex
CREATE INDEX "Act_filmProjectId_idx" ON "Act"("filmProjectId");

-- CreateIndex
CREATE INDEX "Sequence_actId_idx" ON "Sequence"("actId");

-- CreateIndex
CREATE INDEX "FilmScene_sequenceId_idx" ON "FilmScene"("sequenceId");

-- CreateIndex
CREATE INDEX "FilmCastMember_filmProjectId_idx" ON "FilmCastMember"("filmProjectId");

-- CreateIndex
CREATE INDEX "FilmLocation_filmProjectId_idx" ON "FilmLocation"("filmProjectId");

-- CreateIndex
CREATE INDEX "SeriesProject_userId_idx" ON "SeriesProject"("userId");

-- CreateIndex
CREATE INDEX "Season_seriesId_idx" ON "Season"("seriesId");

-- CreateIndex
CREATE INDEX "Episode_seasonId_idx" ON "Episode"("seasonId");

-- CreateIndex
CREATE INDEX "MediaBin_projectId_idx" ON "MediaBin"("projectId");

-- CreateIndex
CREATE INDEX "BinClipEntry_binId_idx" ON "BinClipEntry"("binId");

-- CreateIndex
CREATE INDEX "RoutingDecision_sceneCategory_assignedEngine_idx" ON "RoutingDecision"("sceneCategory", "assignedEngine");

-- CreateIndex
CREATE INDEX "EnginePerformanceLog_engineId_createdAt_idx" ON "EnginePerformanceLog"("engineId", "createdAt");

-- CreateIndex
CREATE INDEX "BlendQualityLog_clipId_idx" ON "BlendQualityLog"("clipId");

-- CreateIndex
CREATE INDEX "ProbeResult_engineId_category_idx" ON "ProbeResult"("engineId", "category");

-- CreateIndex
CREATE INDEX "ModelReport_engineId_reportDate_idx" ON "ModelReport"("engineId", "reportDate");

-- CreateIndex
CREATE INDEX "ModelUpdate_engineId_idx" ON "ModelUpdate"("engineId");

-- CreateIndex
CREATE INDEX "TrainingSignal_processed_signalType_idx" ON "TrainingSignal"("processed", "signalType");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultCharacter" ADD CONSTRAINT "VaultCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultLocation" ADD CONSTRAINT "VaultLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingData" ADD CONSTRAINT "TrainingData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RLHFLog" ADD CONSTRAINT "RLHFLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLink" ADD CONSTRAINT "ReviewLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "ReviewLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmProject" ADD CONSTRAINT "FilmProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Act" ADD CONSTRAINT "Act_filmProjectId_fkey" FOREIGN KEY ("filmProjectId") REFERENCES "FilmProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmScene" ADD CONSTRAINT "FilmScene_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmCastMember" ADD CONSTRAINT "FilmCastMember_filmProjectId_fkey" FOREIGN KEY ("filmProjectId") REFERENCES "FilmProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmLocation" ADD CONSTRAINT "FilmLocation_filmProjectId_fkey" FOREIGN KEY ("filmProjectId") REFERENCES "FilmProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesProject" ADD CONSTRAINT "SeriesProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SeriesProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBin" ADD CONSTRAINT "MediaBin_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinClipEntry" ADD CONSTRAINT "BinClipEntry_binId_fkey" FOREIGN KEY ("binId") REFERENCES "MediaBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

