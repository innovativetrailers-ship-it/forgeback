-- CreateTable
CREATE TABLE "QualityLog" (
    "id" TEXT NOT NULL,
    "shotId" TEXT,
    "userId" TEXT,
    "jobId" TEXT,
    "model" TEXT NOT NULL,
    "purpose" TEXT,
    "mode" TEXT,
    "source" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "dimension" TEXT,
    "reason" TEXT,
    "onIntent" BOOLEAN,
    "characterMatch" DOUBLE PRECISION,
    "cameraMatch" BOOLEAN,
    "locationMatch" DOUBLE PRECISION,
    "artifacts" BOOLEAN,
    "checks" JSONB,
    "intent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QualityLog_shotId_idx" ON "QualityLog"("shotId");
CREATE INDEX "QualityLog_userId_idx" ON "QualityLog"("userId");
CREATE INDEX "QualityLog_model_purpose_idx" ON "QualityLog"("model", "purpose");
CREATE INDEX "QualityLog_dimension_createdAt_idx" ON "QualityLog"("dimension", "createdAt");
CREATE INDEX "QualityLog_verdict_createdAt_idx" ON "QualityLog"("verdict", "createdAt");
CREATE INDEX "QualityLog_source_createdAt_idx" ON "QualityLog"("source", "createdAt");
