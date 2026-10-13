-- Cognitive Director: CoALA memory stores (episodic + semantic + procedural).
-- pgvector is required for the vector(1024) embedding columns. Enabling it here
-- means the migration applies in one shot on a fresh database.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "EpisodicMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "intent" JSONB,
    "brief" JSONB,
    "outcome" JSONB,
    "embedding" vector(1024),
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodicMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "evidence" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "embedding" vector(1024),
    "reinforceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingPolicy" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "avgGenSeconds" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpisodicMemory_userId_idx" ON "EpisodicMemory"("userId");

-- CreateIndex
CREATE INDEX "EpisodicMemory_kind_idx" ON "EpisodicMemory"("kind");

-- CreateIndex
CREATE INDEX "SemanticMemory_userId_idx" ON "SemanticMemory"("userId");

-- CreateIndex
CREATE INDEX "SemanticMemory_category_idx" ON "SemanticMemory"("category");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingPolicy_contentType_model_key" ON "RoutingPolicy"("contentType", "model");

-- CreateIndex
CREATE INDEX "RoutingPolicy_contentType_idx" ON "RoutingPolicy"("contentType");

-- AddForeignKey
ALTER TABLE "EpisodicMemory" ADD CONSTRAINT "EpisodicMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
