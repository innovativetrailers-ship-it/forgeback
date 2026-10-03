-- Foldered media library. Additive only.
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "sceneId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaFolder_projectId_idx" ON "MediaFolder"("projectId");
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset" ADD COLUMN "folderId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "variationOf" TEXT;
ALTER TABLE "Asset" ADD COLUMN "mediaKind" TEXT;
ALTER TABLE "Asset" ADD COLUMN "label" TEXT;
ALTER TABLE "Asset" ADD COLUMN "contentType" TEXT;

CREATE INDEX "Asset_folderId_idx" ON "Asset"("folderId");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
