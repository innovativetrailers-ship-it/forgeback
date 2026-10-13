-- CreateEnum
CREATE TYPE "StudioSceneStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'FAILED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "musicUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ambienceUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudioScene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "title" TEXT,
    "transitionFrame" TEXT,
    "status" "StudioSceneStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioScene_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudioClip" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "clipNumber" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "videoUrl" TEXT,
    "keyframeUrl" TEXT,
    "scriptBeatId" TEXT,

    CONSTRAINT "StudioClip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioScene_projectId_sceneNumber_key" ON "StudioScene"("projectId", "sceneNumber");
CREATE INDEX IF NOT EXISTS "StudioScene_projectId_idx" ON "StudioScene"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudioClip_sceneId_clipNumber_key" ON "StudioClip"("sceneId", "clipNumber");
CREATE INDEX IF NOT EXISTS "StudioClip_sceneId_idx" ON "StudioClip"("sceneId");

ALTER TABLE "StudioScene" ADD CONSTRAINT "StudioScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioClip" ADD CONSTRAINT "StudioClip_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StudioScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
