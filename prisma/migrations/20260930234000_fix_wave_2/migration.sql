-- Fix wave 2. Additive columns only. No clip, plate, or asset rows are deleted.
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN IF NOT EXISTS "retryEligible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "loraError" TEXT;

ALTER TABLE "LocationPlate" ADD COLUMN IF NOT EXISTS "assetId" TEXT;

CREATE INDEX IF NOT EXISTS "LocationPlate_assetId_idx" ON "LocationPlate"("assetId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocationPlate_assetId_fkey'
  ) THEN
    ALTER TABLE "LocationPlate"
      ADD CONSTRAINT "LocationPlate_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
