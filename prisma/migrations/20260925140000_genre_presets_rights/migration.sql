-- AlterTable
ALTER TABLE "Project" ADD COLUMN "genrePresetId" TEXT;

ALTER TABLE "StudioClip" ADD COLUMN "genrePresetId" TEXT;

ALTER TABLE "TrainingRun" ADD COLUMN "importDomain" TEXT;
ALTER TABLE "TrainingRun" ADD COLUMN "ownedOrLicensed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrainingRun" ADD COLUMN "subjectConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrainingRun" ADD COLUMN "captionGuidance" TEXT;
