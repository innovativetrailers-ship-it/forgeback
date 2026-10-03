-- CreateTable
CREATE TABLE "TrainingRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "trainerKey" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "trains" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerPhrase" TEXT,
    "steps" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "dataUrl" TEXT,
    "isolateSubject" BOOLEAN NOT NULL DEFAULT false,
    "falRequestId" TEXT,
    "falSubmission" TEXT,
    "loraUrl" TEXT,
    "configUrl" TEXT,
    "loraInference" TEXT,
    "errorMessage" TEXT,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingRun_userId_status_idx" ON "TrainingRun"("userId", "status");
CREATE INDEX "TrainingRun_falRequestId_idx" ON "TrainingRun"("falRequestId");
CREATE INDEX "TrainingRun_jobId_idx" ON "TrainingRun"("jobId");

ALTER TABLE "TrainingRun" ADD CONSTRAINT "TrainingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
