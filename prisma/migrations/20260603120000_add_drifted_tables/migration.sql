-- AlterTable
ALTER TABLE "RenderJob" ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'simple',
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "statusMessage" TEXT,
ALTER COLUMN "type" SET DEFAULT 'GENERATE',
ALTER COLUMN "inputPayload" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "StripeCustomer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId1" TEXT NOT NULL,
    "userId2" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppableEmbed" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "embedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppableEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchingEmbed" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL,
    "embedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchingEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPlate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "displayName" TEXT,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPlate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "timecode" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "parentId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialConnection_userId_idx" ON "SocialConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_userId_platform_key" ON "SocialConnection"("userId", "platform");

-- CreateIndex
CREATE INDEX "ConflictLog_projectId_resolvedAt_idx" ON "ConflictLog"("projectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ConflictLog_projectId_createdAt_idx" ON "ConflictLog"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppableEmbed_embedId_key" ON "ShoppableEmbed"("embedId");

-- CreateIndex
CREATE INDEX "ShoppableEmbed_projectId_idx" ON "ShoppableEmbed"("projectId");

-- CreateIndex
CREATE INDEX "ShoppableEmbed_embedId_idx" ON "ShoppableEmbed"("embedId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchingEmbed_embedId_key" ON "BranchingEmbed"("embedId");

-- CreateIndex
CREATE INDEX "BranchingEmbed_projectId_idx" ON "BranchingEmbed"("projectId");

-- CreateIndex
CREATE INDEX "BranchingEmbed_embedId_idx" ON "BranchingEmbed"("embedId");

-- CreateIndex
CREATE INDEX "LocationPlate_userId_idx" ON "LocationPlate"("userId");

-- CreateIndex
CREATE INDEX "LocationPlate_type_idx" ON "LocationPlate"("type");

-- CreateIndex
CREATE INDEX "ClipComment_projectId_clipId_idx" ON "ClipComment"("projectId", "clipId");

-- CreateIndex
CREATE INDEX "ClipComment_projectId_createdAt_idx" ON "ClipComment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ClipComment_parentId_idx" ON "ClipComment"("parentId");

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPlate" ADD CONSTRAINT "LocationPlate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipComment" ADD CONSTRAINT "ClipComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ClipComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
