-- Separate allocation and purchased buckets. Existing balance is treated as purchased.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allocationCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purchasedCredits" INTEGER NOT NULL DEFAULT 0;

UPDATE "User"
SET "purchasedCredits" = "creditBalance"
WHERE "allocationCredits" = 0
  AND "purchasedCredits" = 0
  AND "creditBalance" > 0;

-- No negative rows were present when this migration was written.
ALTER TABLE "User" ADD CONSTRAINT "User_creditBalance_nonnegative" CHECK ("creditBalance" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_heldCredits_nonnegative" CHECK ("heldCredits" >= 0);
