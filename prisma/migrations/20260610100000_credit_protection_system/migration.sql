-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'SETTLED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'NEEDS_ATTENTION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "heldCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amountHeld" INTEGER NOT NULL,
    "amountUsed" INTEGER NOT NULL DEFAULT 0,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "budgetCap" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CreditHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentCheckpoint" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "shotId" INTEGER NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "qaPassed" BOOLEAN NOT NULL DEFAULT true,
    "anchorFrame" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentLedger" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditHold_jobId_key" ON "CreditHold"("jobId");

-- CreateIndex
CREATE INDEX "CreditHold_userId_idx" ON "CreditHold"("userId");

-- CreateIndex
CREATE INDEX "SegmentCheckpoint_jobId_idx" ON "SegmentCheckpoint"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentCheckpoint_jobId_segmentId_key" ON "SegmentCheckpoint"("jobId", "segmentId");

-- CreateIndex
CREATE INDEX "SegmentLedger_jobId_idx" ON "SegmentLedger"("jobId");

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RenderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentCheckpoint" ADD CONSTRAINT "SegmentCheckpoint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RenderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentLedger" ADD CONSTRAINT "SegmentLedger_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RenderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
