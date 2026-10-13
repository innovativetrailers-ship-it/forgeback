-- CreateTable
CREATE TABLE "ShotError" (
    "id" TEXT NOT NULL,
    "shotId" TEXT,
    "userId" TEXT,
    "jobId" TEXT,
    "model" TEXT NOT NULL,
    "mode" TEXT,
    "purpose" TEXT,
    "endpoint" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "falRequestId" TEXT,
    "rawError" TEXT NOT NULL,
    "providerLogs" JSONB,
    "payloadSnapshot" JSONB,
    "signature" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "correctable" BOOLEAN NOT NULL,
    "correction" TEXT,
    "interpretedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShotError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShotError_shotId_idx" ON "ShotError"("shotId");
CREATE INDEX "ShotError_userId_idx" ON "ShotError"("userId");
CREATE INDEX "ShotError_model_category_idx" ON "ShotError"("model", "category");
CREATE INDEX "ShotError_category_createdAt_idx" ON "ShotError"("category", "createdAt");
CREATE INDEX "ShotError_signature_idx" ON "ShotError"("signature");
CREATE INDEX "ShotError_endpoint_idx" ON "ShotError"("endpoint");
CREATE INDEX "ShotError_falRequestId_idx" ON "ShotError"("falRequestId");

CREATE TABLE "ErrorInterpretationCache" (
    "signature" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "correctable" BOOLEAN NOT NULL,
    "correction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorInterpretationCache_pkey" PRIMARY KEY ("signature")
);

CREATE TABLE "ModelErrorTally" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelErrorTally_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelErrorTally_userId_model_category_key" ON "ModelErrorTally"("userId", "model", "category");
CREATE INDEX "ModelErrorTally_model_category_idx" ON "ModelErrorTally"("model", "category");
