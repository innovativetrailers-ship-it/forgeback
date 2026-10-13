import { readFileSync } from 'node:fs'
import pg from 'pg'

function load(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || process.env[match[1]]) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[match[1]] = value
    }
  } catch { /* optional env file */ }
}
load('.env')
load('.env.local')

const url = (process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('NO_DATABASE_URL')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
const report = {}

const one = async (sql) => (await client.query(sql)).rows[0]

report.clipsCompleted = Number((await client.query(`
  UPDATE "StudioClip"
  SET status = 'COMPLETED', "statusReason" = NULL, "retryEligible" = false
  WHERE status = 'PENDING' AND "videoUrl" IS NOT NULL AND "videoUrl" <> ''
`)).rowCount)

report.clipsFailed = Number((await client.query(`
  UPDATE "StudioClip"
  SET status = 'FAILED',
      "retryEligible" = ("keyframeUrl" IS NOT NULL OR btrim(coalesce(prompt, '')) <> ''),
      "statusReason" = CASE
        WHEN "keyframeUrl" IS NULL AND btrim(coalesce(prompt, '')) = ''
          THEN 'No video and nothing to resubmit. The clip was kept.'
        ELSE 'Recoverable, but generation is paused, so it was not resubmitted. The clip was kept.'
      END
  WHERE status = 'PENDING' AND ("videoUrl" IS NULL OR "videoUrl" = '')
`)).rowCount)

report.scenes = Number((await client.query(`
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
  END
`)).rowCount)

report.jobsClosed = Number((await client.query(`
  UPDATE "RenderJob"
  SET status = 'FAILED',
      "errorMessage" = 'Reconciled: processing for over an hour with no output. Not resubmitted while generation is paused.',
      "completedAt" = COALESCE("completedAt", now())
  WHERE status = 'PROCESSING'
    AND ("outputUrl" IS NULL OR "outputUrl" = '')
    AND "updatedAt" < now() - interval '1 hour'
`)).rowCount)

await client.query(`UPDATE "CreditTransaction" SET type = 'signup_grant' WHERE type IS NULL AND amount > 0 AND amount < 100000`)
await client.query(`UPDATE "CreditTransaction" SET type = 'adjustment' WHERE type IS NULL AND amount >= 100000`)
await client.query(`UPDATE "CreditTransaction" SET type = 'deduction' WHERE type IS NULL AND amount < 0`)

report.ledgers = Number((await client.query(`
  UPDATE "User" u
  SET "creditBalance" = COALESCE((SELECT SUM(amount)::int FROM "CreditTransaction" t WHERE t."userId" = u.id), 0),
      "heldCredits" = COALESCE((SELECT SUM("amountHeld")::int FROM "CreditHold" h WHERE h."userId" = u.id AND h.status = 'ACTIVE'), 0)
  WHERE u."isInternal" = false
    AND (
      u."creditBalance" IS DISTINCT FROM COALESCE((SELECT SUM(amount)::int FROM "CreditTransaction" t WHERE t."userId" = u.id), 0)
      OR u."heldCredits" IS DISTINCT FROM COALESCE((SELECT SUM("amountHeld")::int FROM "CreditHold" h WHERE h."userId" = u.id AND h.status = 'ACTIVE'), 0)
    )
`)).rowCount)

report.counters = Number((await client.query(`
  UPDATE "User" u
  SET "totalGenerated" = (
    SELECT COUNT(*)::int FROM "StudioClip" c
    JOIN "StudioScene" s ON s.id = c."sceneId"
    JOIN "Project" p ON p.id = s."projectId"
    WHERE p."userId" = u.id AND c.status = 'COMPLETED'
  )
  WHERE u."totalGenerated" IS DISTINCT FROM (
    SELECT COUNT(*)::int FROM "StudioClip" c
    JOIN "StudioScene" s ON s.id = c."sceneId"
    JOIN "Project" p ON p.id = s."projectId"
    WHERE p."userId" = u.id AND c.status = 'COMPLETED'
  )
`)).rowCount)

const reason = (await one(`
  SELECT "errorMessage" AS message FROM "RenderJob"
  WHERE type = 'LORA_TRAIN' AND status = 'FAILED' AND "errorMessage" IS NOT NULL
  ORDER BY "updatedAt" DESC LIMIT 1
`))?.message || 'Training did not produce a LoRA. The character was kept.'

report.characters = Number((await client.query(`
  UPDATE "VaultCharacter"
  SET "loraStatus" = 'FAILED', "loraError" = $1
  WHERE "loraStatus" = 'TRAINING' AND ("loraModelId" IS NULL OR "updatedAt" < now() - interval '6 hours')
`, [reason])).rowCount)
report.characterReasons = Number((await client.query(`
  UPDATE "VaultCharacter" SET "loraError" = $1 WHERE "loraStatus" = 'FAILED' AND "loraError" IS NULL
`, [reason])).rowCount)

report.plates = Number((await client.query(`
  WITH created AS (
    INSERT INTO "Asset" (
      id, "ownerId", kind, label, "generatedImage", "sourceRefs", "resolutionState",
      "usableAsReference", boundary, "isPrimary", "createdAt", "updatedAt"
    )
    SELECT
      'loc_' || p.id,
      p."userId",
      'location',
      COALESCE(NULLIF(p."displayName", ''), NULLIF(p.city, ''), 'Location'),
      p."imageUrl",
      ARRAY[p.id, p."sourceUrl"],
      'imported',
      true,
      jsonb_build_object(
        'plateId', p.id, 'type', p.type, 'lat', p.lat, 'lng', p.lng,
        'city', p.city, 'country', p.country, 'sourceUrl', p."sourceUrl"
      ),
      true,
      now(),
      now()
    FROM "LocationPlate" p
    WHERE p."assetId" IS NULL
    RETURNING id, boundary->>'plateId' AS "plateId"
  )
  UPDATE "LocationPlate" p
  SET "assetId" = created.id
  FROM created
  WHERE p.id = created."plateId"
`)).rowCount)

report.assets = Number((await client.query(`
  UPDATE "Asset"
  SET boundary = COALESCE(boundary, '{}'::jsonb) || '{"needsAction":"Unresolved — action needed. Nothing was generated."}'::jsonb
  WHERE "resolutionState" = 'unresolved'
    AND "generatedImage" IS NULL
    AND ("weightsKey" IS NULL OR "weightsKey" = '')
`)).rowCount)

const drafts = await client.query(`SELECT id, "timelineJson" FROM "Project" WHERE status = 'draft'`)
let draftsPatched = 0
for (const project of drafts.rows) {
  const recipe = project.timelineJson
  if (!recipe?.tracks) continue
  let changed = false
  for (const track of recipe.tracks) {
    for (const clip of track.clips ?? []) {
      const source = typeof clip.sourceUrl === 'string' ? clip.sourceUrl.trim() : ''
      const prompt = typeof clip.prompt === 'string' ? clip.prompt.trim() : ''
      if (!source && !prompt) {
        clip.prompt = 'Missing media. This clip was kept.'
        clip.statusReason = 'orphan-placeholder'
        changed = true
      }
    }
  }
  if (!changed) continue
  await client.query(`UPDATE "Project" SET "timelineJson" = $2::jsonb WHERE id = $1`, [project.id, JSON.stringify(recipe)])
  draftsPatched += 1
}
report.draftsPatched = draftsPatched

const pending = await one(`SELECT COUNT(*)::int AS n FROM "StudioClip" WHERE status = 'PENDING'`)
const processing = await one(`SELECT COUNT(*)::int AS n FROM "RenderJob" WHERE status = 'PROCESSING'`)
report.pendingLeft = pending.n
report.processingLeft = processing.n

console.log(JSON.stringify(report))
await client.end()
