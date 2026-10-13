-- Add subscriptionTier (plan) separate from subscriptionStatus (billing state).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT NOT NULL DEFAULT 'free';

-- Legacy: tier was stored in subscriptionStatus.
UPDATE "User"
SET "subscriptionTier" = "subscriptionStatus",
    "subscriptionStatus" = 'active'
WHERE "subscriptionStatus" IN ('pro', 'studio', 'ultimate');

UPDATE "User"
SET "subscriptionTier" = 'pro',
    "subscriptionStatus" = 'active'
WHERE "subscriptionStatus" = 'active' AND "subscriptionTier" = 'free';

UPDATE "User"
SET "subscriptionTier" = 'free'
WHERE "subscriptionStatus" IN ('trial', 'canceled', 'past_due')
  AND "subscriptionTier" NOT IN ('pro', 'studio', 'ultimate');
