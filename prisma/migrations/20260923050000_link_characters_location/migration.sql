-- Link shots to cast and a mirrored location plate. Additive only.
ALTER TABLE "StudioClip" ADD COLUMN "characterIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StudioClip" ADD COLUMN "locationId" TEXT;
ALTER TABLE "VaultCharacter" ADD COLUMN "seed" INTEGER;

CREATE INDEX "StudioClip_locationId_idx" ON "StudioClip"("locationId");

ALTER TABLE "StudioClip" ADD CONSTRAINT "StudioClip_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "LocationPlate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
