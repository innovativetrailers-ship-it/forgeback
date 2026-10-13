-- E4 additive. New objects are recorded here. Existing object keys are copied, never renamed or deleted.
CREATE TABLE IF NOT EXISTS "StoredObject" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoredObject_storageKey_key" ON "StoredObject"("storageKey");
CREATE INDEX IF NOT EXISTS "StoredObject_ownerId_idx" ON "StoredObject"("ownerId");

DO $$ BEGIN
  ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "StoredObject" ("id", "ownerId", "storageKey")
SELECT md5('job:' || "storageKey"), "userId", "storageKey"
FROM "RenderJob"
WHERE "storageKey" IS NOT NULL AND "storageKey" <> ''
ON CONFLICT ("storageKey") DO NOTHING;

INSERT INTO "StoredObject" ("id", "ownerId", "storageKey")
SELECT md5('clip:' || c."storageKey"), p."userId", c."storageKey"
FROM "StudioClip" c
JOIN "StudioScene" sc ON sc."id" = c."sceneId"
JOIN "Project" p ON p."id" = sc."projectId"
WHERE c."storageKey" IS NOT NULL AND c."storageKey" <> ''
ON CONFLICT ("storageKey") DO NOTHING;
