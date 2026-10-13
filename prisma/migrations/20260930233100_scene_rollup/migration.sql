-- Recompute scene status from clips. Runs after PARTIAL exists.
UPDATE "StudioScene" s
SET status = CASE
  WHEN NOT EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id) THEN 'PENDING'::"StudioSceneStatus"
  WHEN EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status = 'GENERATING') THEN 'GENERATING'::"StudioSceneStatus"
  WHEN EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status IN ('PENDING', 'AWAITING_DIRECTION')) THEN 'PENDING'::"StudioSceneStatus"
  WHEN EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status = 'FAILED')
   AND EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status IN ('COMPLETED', 'MANUAL')) THEN 'PARTIAL'::"StudioSceneStatus"
  WHEN NOT EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status <> 'FAILED') THEN 'FAILED'::"StudioSceneStatus"
  WHEN NOT EXISTS (SELECT 1 FROM "StudioClip" c WHERE c."sceneId" = s.id AND c.status NOT IN ('COMPLETED', 'MANUAL')) THEN 'GENERATED'::"StudioSceneStatus"
  ELSE 'PENDING'::"StudioSceneStatus"
END;

UPDATE "RenderJob"
SET status = 'FAILED',
    "errorMessage" = 'Reconciled: stuck processing with no output. Not re-queued while generation is paused.',
    "completedAt" = COALESCE("completedAt", now())
WHERE status = 'PROCESSING'
  AND ("outputUrl" IS NULL OR "outputUrl" = '')
  AND "updatedAt" < now() - interval '1 day';

UPDATE "User" u
SET "creditBalance" = u."creditBalance" + h.amount,
    "heldCredits" = GREATEST(0, u."heldCredits" - h.amount)
FROM (
  SELECT h."userId", SUM(h."amountHeld")::int AS amount
  FROM "CreditHold" h
  JOIN "RenderJob" j ON j.id = h."jobId"
  WHERE h.status = 'ACTIVE'
    AND j.status IN ('COMPLETE', 'FAILED', 'CANCELLED', 'NEEDS_ATTENTION')
  GROUP BY h."userId"
) h
WHERE u.id = h."userId" AND u."isInternal" = false;

INSERT INTO "CreditTransaction" ("id", "userId", "amount", "type", "description", "balanceAfter", "createdAt")
SELECT
  'rel_' || h.id,
  h."userId",
  h."amountHeld",
  'release',
  'Released orphaned hold ' || h."jobId",
  0,
  now()
FROM "CreditHold" h
JOIN "RenderJob" j ON j.id = h."jobId"
JOIN "User" u ON u.id = h."userId"
WHERE h.status = 'ACTIVE'
  AND h."amountHeld" > 0
  AND u."isInternal" = false
  AND j.status IN ('COMPLETE', 'FAILED', 'CANCELLED', 'NEEDS_ATTENTION');

UPDATE "CreditHold" h
SET status = 'REFUNDED',
    "settledAt" = now()
FROM "RenderJob" j
WHERE j.id = h."jobId"
  AND h.status = 'ACTIVE'
  AND j.status IN ('COMPLETE', 'FAILED', 'CANCELLED', 'NEEDS_ATTENTION');
