CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourcePrompt" TEXT,
    "sourceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedImage" TEXT,
    "weightsKey" TEXT,
    "baseModel" TEXT,
    "baseVersion" TEXT,
    "baseBackupKey" TEXT,
    "usableAsReference" BOOLEAN NOT NULL DEFAULT false,
    "vaultCharacterId" TEXT,
    "trainedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_vaultCharacterId_key" ON "Asset"("vaultCharacterId");
CREATE UNIQUE INDEX "Asset_trainedAssetId_key" ON "Asset"("trainedAssetId");
CREATE INDEX "Asset_ownerId_kind_idx" ON "Asset"("ownerId", "kind");
CREATE INDEX "Asset_vaultCharacterId_idx" ON "Asset"("vaultCharacterId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Asset" (
    "id", "ownerId", "kind", "sourceRefs", "generatedImage", "usableAsReference", "vaultCharacterId", "createdAt", "updatedAt"
)
SELECT
    c."id",
    p."userId",
    'character',
    c."referenceUrls",
    c."referenceUrls"[1],
    true,
    c."id",
    c."createdAt",
    c."updatedAt"
FROM "VaultCharacter" c
JOIN "Project" p ON p."id" = c."projectId"
ON CONFLICT ("id") DO NOTHING;
