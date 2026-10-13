-- CreateTable
CREATE TABLE IF NOT EXISTS "FilmTemplate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "format" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "style" JSONB NOT NULL,
    "music" JSONB,
    "captionStyle" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilmTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FilmTemplate_ownerId_idx" ON "FilmTemplate"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FilmTemplate_isPublic_category_idx" ON "FilmTemplate"("isPublic", "category");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FilmTemplate" ADD CONSTRAINT "FilmTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
