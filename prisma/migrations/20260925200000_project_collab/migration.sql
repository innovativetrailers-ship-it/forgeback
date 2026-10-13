-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'DIRECTOR', 'EDITOR', 'WRITER', 'REVIEWER', 'VIEWER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "scriptContent" TEXT;
ALTER TABLE "Project" ADD COLUMN "collabMeta" JSONB;

-- AlterTable
ALTER TABLE "StudioClip" ADD COLUMN "generateClaimJobId" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "generateClaimedBy" TEXT;
ALTER TABLE "StudioClip" ADD COLUMN "generateClaimedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
