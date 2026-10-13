ALTER TABLE "Project" ADD COLUMN "gateMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "StudioClip" ADD COLUMN "chainFrom" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "chainBlock" TEXT;
