-- Manual shot direction v2: model override + generating watchdog timestamp

ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "modelOverride" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "generatingAt" TIMESTAMP(3);
