-- Add balanceAfter column to CreditTransaction (nullable for backwards compat)
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "balanceAfter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditTransaction" ALTER COLUMN "type" DROP NOT NULL;

-- ClonedVoice
CREATE TABLE IF NOT EXISTS "ClonedVoice" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "voiceId"     TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClonedVoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClonedVoice_userId_voiceId_key" ON "ClonedVoice"("userId", "voiceId");
CREATE INDEX IF NOT EXISTS "ClonedVoice_userId_idx" ON "ClonedVoice"("userId");
ALTER TABLE "ClonedVoice" ADD CONSTRAINT "ClonedVoice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StripeCustomer
CREATE TABLE IF NOT EXISTS "StripeCustomer" (
    "id"                   TEXT NOT NULL,
    "userId"               TEXT NOT NULL,
    "stripeCustomerId"     TEXT NOT NULL,
    "stripeBalanceCents"   INTEGER NOT NULL DEFAULT 0,
    "lifetimeDepositCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripeCustomer_userId_key"           ON "StripeCustomer"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StripeDeposit
CREATE TABLE IF NOT EXISTS "StripeDeposit" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "stripeCustomerId"      TEXT NOT NULL,
    "paymentIntentId"       TEXT NOT NULL,
    "amountCents"           INTEGER NOT NULL,
    "platformFeeCents"      INTEGER NOT NULL,
    "vendorAllocationCents" INTEGER NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeDeposit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripeDeposit_paymentIntentId_key" ON "StripeDeposit"("paymentIntentId");
ALTER TABLE "StripeDeposit" ADD CONSTRAINT "StripeDeposit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VendorUsageLog
CREATE TABLE IF NOT EXISTS "VendorUsageLog" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "vendor"     TEXT NOT NULL,
    "operation"  TEXT NOT NULL,
    "costUSD"    DOUBLE PRECISION NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "requestId"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VendorUsageLog_userId_idx"    ON "VendorUsageLog"("userId");
CREATE INDEX IF NOT EXISTS "VendorUsageLog_vendor_idx"    ON "VendorUsageLog"("vendor");
CREATE INDEX IF NOT EXISTS "VendorUsageLog_createdAt_idx" ON "VendorUsageLog"("createdAt");
ALTER TABLE "VendorUsageLog" ADD CONSTRAINT "VendorUsageLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreditTransaction additional index
CREATE INDEX IF NOT EXISTS "CreditTransaction_createdAt_idx" ON "CreditTransaction"("createdAt");
