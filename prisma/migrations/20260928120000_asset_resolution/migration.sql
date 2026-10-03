-- Wave 7 production workflow. Additive columns only.
ALTER TABLE "Asset" ADD COLUMN "resolutionState" TEXT NOT NULL DEFAULT 'unresolved';
ALTER TABLE "Asset" ADD COLUMN "appearsInShots" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN "productionBreakdown" JSONB;
