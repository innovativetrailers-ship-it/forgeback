-- CHAR V2 transfer: appearance + wardrobe for VaultCharacter FCC parity

ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "refProfile" TEXT;
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "ref3Quarter" TEXT;
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "refBack" TEXT;
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "bodyEmbedding" JSONB;
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "appearance" JSONB;
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "behavioralPrompt" TEXT;

CREATE TABLE IF NOT EXISTS "WardrobeItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "refImageUrl" TEXT NOT NULL,
    "lockedHash" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WardrobeItem_characterId_idx" ON "WardrobeItem"("characterId");

DO $$ BEGIN
  ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "VaultCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
