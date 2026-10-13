-- Fix wave 1. Additive. Does not drop the Prisma User/Account/Session tables.
ALTER TYPE "StudioSceneStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- The two ADMIN rows are the dev seed accounts. They become internal: no app balance.
UPDATE "User"
SET "isInternal" = true,
    "creditBalance" = 0,
    "heldCredits" = 0
WHERE role = 'ADMIN';

UPDATE "CreditTransaction"
SET type = 'signup_grant'
WHERE type IS NULL AND amount > 0 AND amount < 100000;

UPDATE "CreditTransaction"
SET type = 'adjustment'
WHERE type IS NULL AND amount >= 100000;

UPDATE "CreditTransaction"
SET type = 'deduction'
WHERE type IS NULL AND amount < 0;

-- Real users: balance follows the typed ledger. Internal stays at 0.
UPDATE "User" u
SET "creditBalance" = COALESCE((
  SELECT SUM(amount)::int FROM "CreditTransaction" t WHERE t."userId" = u.id
), 0)
WHERE u."isInternal" = false;

UPDATE "User" u
SET "totalGenerated" = (
  SELECT COUNT(*)::int
  FROM "StudioClip" c
  JOIN "StudioScene" s ON s.id = c."sceneId"
  JOIN "Project" p ON p.id = s."projectId"
  WHERE p."userId" = u.id AND c.status = 'COMPLETED'
);

-- Stuck character with no LoRA id is not still training.
UPDATE "VaultCharacter"
SET "loraStatus" = 'FAILED'
WHERE "loraStatus" = 'TRAINING' AND "loraModelId" IS NULL;
