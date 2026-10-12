-- Idempotency for Stripe webhook deliveries. Additive.
CREATE TABLE IF NOT EXISTS "ProcessedStripeEvent" (
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX IF NOT EXISTS "CreditTransaction_stripeId_idx" ON "CreditTransaction"("stripeId");
