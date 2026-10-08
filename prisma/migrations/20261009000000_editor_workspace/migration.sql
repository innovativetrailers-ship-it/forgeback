CREATE TABLE "EditorWorkspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timelineMode" TEXT NOT NULL DEFAULT 'full',
    "layout" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorWorkspace_userId_name_key" ON "EditorWorkspace"("userId", "name");
CREATE INDEX "EditorWorkspace_userId_idx" ON "EditorWorkspace"("userId");

ALTER TABLE "EditorWorkspace" ADD CONSTRAINT "EditorWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
