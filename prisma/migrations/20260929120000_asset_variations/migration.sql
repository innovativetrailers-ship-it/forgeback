-- Primary reference and derived variations. Existing assets stay primaries with an empty tree.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "variations" JSONB NOT NULL DEFAULT '[]';
