-- D1/D4 additive. Old rows stay. A missing column is added, never dropped.
ALTER TABLE "StudioScene" ADD COLUMN IF NOT EXISTS "orphanedAt" TIMESTAMP(3);
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "orphanedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "StudioClip_status_generatingAt_idx" ON "StudioClip" ("status", "generatingAt");
CREATE INDEX IF NOT EXISTS "CreditHold_status_idx" ON "CreditHold" ("status");
CREATE INDEX IF NOT EXISTS "RenderJob_falRequestId_idx" ON "RenderJob" (("inputPayload"->>'falRequestId'));
