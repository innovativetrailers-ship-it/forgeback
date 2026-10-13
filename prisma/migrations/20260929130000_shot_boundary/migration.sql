-- Explicit edit into a shot. Null means a hard cut. Dissolves stay editor transitions.
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "boundary" JSONB;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "boundary" JSONB;
