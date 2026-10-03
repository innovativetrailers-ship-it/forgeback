-- AlterTable
ALTER TABLE "StudioClip" ADD COLUMN "purpose" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "delegationReason" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "delegatedMode" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "moneyShot" BOOLEAN NOT NULL DEFAULT false;
