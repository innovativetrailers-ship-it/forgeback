-- AlterTable
ALTER TABLE "RewardSignal" ADD COLUMN "shotId" TEXT;
ALTER TABLE "RewardSignal" ADD COLUMN "purpose" TEXT;
ALTER TABLE "RewardSignal" ADD COLUMN "mode" TEXT;
ALTER TABLE "RewardSignal" ADD COLUMN "reason" TEXT;
ALTER TABLE "RewardSignal" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'behaviour';

-- CreateTable
CREATE TABLE "ModelPurposeScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mode" TEXT,
    "worked" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPurposeScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelPurposeScore_userId_model_purpose_key" ON "ModelPurposeScore"("userId", "model", "purpose");
CREATE INDEX "ModelPurposeScore_userId_idx" ON "ModelPurposeScore"("userId");
CREATE INDEX "ModelPurposeScore_model_purpose_idx" ON "ModelPurposeScore"("model", "purpose");
CREATE INDEX "RewardSignal_shotId_idx" ON "RewardSignal"("shotId");
