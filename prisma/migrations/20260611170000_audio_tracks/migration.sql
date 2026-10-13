-- Audio pipeline v2: AudioTrack model + lip sync fields on StudioClip

CREATE TYPE "AudioType" AS ENUM ('DIALOGUE', 'MUSIC', 'AMBIENCE', 'SFX', 'CUSTOM');
CREATE TYPE "AudioProvider" AS ENUM ('ELEVENLABS', 'SUNO', 'UPLOAD');
CREATE TYPE "AudioStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

CREATE TABLE "AudioTrack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AudioType" NOT NULL,
    "provider" "AudioProvider" NOT NULL DEFAULT 'ELEVENLABS',
    "status" "AudioStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT,
    "voiceId" TEXT,
    "sunoStyle" TEXT,
    "sunoLyrics" TEXT,
    "instrumental" BOOLEAN NOT NULL DEFAULT true,
    "shotPlanId" TEXT,
    "sceneNumber" INTEGER,
    "startSec" DOUBLE PRECISION,
    "volumeDb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "fadeInMs" INTEGER NOT NULL DEFAULT 0,
    "fadeOutMs" INTEGER NOT NULL DEFAULT 0,
    "duckUnderDialogue" BOOLEAN NOT NULL DEFAULT false,
    "durationWarning" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "durationMs" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "prevUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioTrack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AudioTrack_projectId_type_idx" ON "AudioTrack"("projectId", "type");
CREATE INDEX "AudioTrack_shotPlanId_idx" ON "AudioTrack"("shotPlanId");

ALTER TABLE "AudioTrack" ADD CONSTRAINT "AudioTrack_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "lipSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "lipSyncModel" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "rawVideoUrl" TEXT;
