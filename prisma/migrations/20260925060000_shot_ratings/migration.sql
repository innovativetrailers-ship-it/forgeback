-- CreateTable
CREATE TABLE "ShotRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "filmId" TEXT,
    "sceneId" TEXT,
    "model" TEXT NOT NULL,
    "mode" TEXT,
    "purpose" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "dimension" TEXT,
    "worked" BOOLEAN NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShotRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShotRating_userId_shotId_key" ON "ShotRating"("userId", "shotId");
CREATE INDEX "ShotRating_userId_idx" ON "ShotRating"("userId");
CREATE INDEX "ShotRating_shotId_idx" ON "ShotRating"("shotId");

CREATE TABLE "FilmRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilmRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FilmRating_userId_projectId_key" ON "FilmRating"("userId", "projectId");
CREATE INDEX "FilmRating_userId_idx" ON "FilmRating"("userId");

CREATE TABLE "UserTasteProfile" (
    "userId" TEXT NOT NULL,
    "modelPreference" JSONB NOT NULL,
    "dimensionSensitivity" JSONB NOT NULL,
    "qualityVsSpeedLean" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTasteProfile_pkey" PRIMARY KEY ("userId")
);
