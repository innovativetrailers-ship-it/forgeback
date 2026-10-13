-- Cognitive enhancements: live performance matrix, implicit reward signals,
-- and a lightweight craft-rule knowledge graph.

-- CreateTable
CREATE TABLE "ModelPerformance" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "avgLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 60000,
    "p95LatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 120000,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "recentFailures" INTEGER NOT NULL DEFAULT 0,
    "costPer5sCredits" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModelPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "model" TEXT,
    "contentType" TEXT,
    "signal" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftRule" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "source" TEXT NOT NULL,
    "reinforceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CraftRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelPerformance_model_key" ON "ModelPerformance"("model");

-- CreateIndex
CREATE INDEX "ModelPerformance_status_idx" ON "ModelPerformance"("status");

-- CreateIndex
CREATE INDEX "RewardSignal_userId_idx" ON "RewardSignal"("userId");

-- CreateIndex
CREATE INDEX "RewardSignal_model_idx" ON "RewardSignal"("model");

-- CreateIndex
CREATE UNIQUE INDEX "CraftRule_subject_relation_object_key" ON "CraftRule"("subject", "relation", "object");

-- CreateIndex
CREATE INDEX "CraftRule_subject_idx" ON "CraftRule"("subject");
