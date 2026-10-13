-- AlterTable
ALTER TABLE "Project" ADD COLUMN "styleLoraId" TEXT;

ALTER TABLE "StudioClip" ADD COLUMN "characterLoraId" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "styleLoraId" TEXT;

ALTER TABLE "VaultCharacter" ADD COLUMN "trainedAssetId" TEXT;

ALTER TABLE "AudioTrack" ADD COLUMN "audioLoraId" TEXT;

ALTER TABLE "ClonedVoice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'cloned';
ALTER TABLE "ClonedVoice" ADD COLUMN "linkedCharacterId" TEXT;
CREATE INDEX "ClonedVoice_linkedCharacterId_idx" ON "ClonedVoice"("linkedCharacterId");

ALTER TABLE "TrainingRun" ADD COLUMN "linkedCharacterId" TEXT;
ALTER TABLE "TrainingRun" ADD COLUMN "trainedAssetId" TEXT;
ALTER TABLE "TrainingRun" ADD COLUMN "subcategory" TEXT NOT NULL DEFAULT '';
CREATE INDEX "TrainingRun_trainedAssetId_idx" ON "TrainingRun"("trainedAssetId");

-- CreateTable
CREATE TABLE "TrainedAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "loraUrl" TEXT NOT NULL,
    "configUrl" TEXT,
    "triggerPhrase" TEXT,
    "trainerId" TEXT NOT NULL,
    "loraInference" TEXT,
    "subcategory" TEXT NOT NULL DEFAULT '',
    "linkedCharacterId" TEXT,
    "trainingRunId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainedAsset_trainingRunId_key" ON "TrainedAsset"("trainingRunId");
CREATE INDEX "TrainedAsset_userId_type_deletedAt_idx" ON "TrainedAsset"("userId", "type", "deletedAt");
CREATE INDEX "TrainedAsset_linkedCharacterId_idx" ON "TrainedAsset"("linkedCharacterId");

ALTER TABLE "TrainedAsset" ADD CONSTRAINT "TrainedAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
