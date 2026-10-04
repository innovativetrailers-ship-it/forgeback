-- CreateEnum
CREATE TYPE "FeatureRequestKind" AS ENUM ('feature', 'tool', 'bug', 'other');

-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('new', 'reviewing', 'planned', 'in_progress', 'implemented', 'declined');

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeatureRequestKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "context" JSONB,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'new',
    "devNote" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequestVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureRequestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_userId_createdAt_idx" ON "FeatureRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeatureRequest_status_upvotes_idx" ON "FeatureRequest"("status", "upvotes");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureRequestVote_requestId_userId_key" ON "FeatureRequestVote"("requestId", "userId");

-- CreateIndex
CREATE INDEX "FeatureRequestVote_userId_idx" ON "FeatureRequestVote"("userId");

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequestVote" ADD CONSTRAINT "FeatureRequestVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequestVote" ADD CONSTRAINT "FeatureRequestVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
