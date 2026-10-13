-- Schema-sync engine: cached FAL OpenAPI constraints per endpoint
CREATE TABLE "ModelConstraint" (
    "endpoint" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConstraint_pkey" PRIMARY KEY ("endpoint")
);
