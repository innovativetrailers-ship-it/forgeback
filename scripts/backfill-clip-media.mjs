/**
 * One-off media backfill. Run with the Railway worker env so the storage
 * credential is the one that already persists new clips.
 * Idempotent: clips that already have a storage key are skipped.
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

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
  } catch { /* railway run injects env */ }
}
if (!process.env.RAILWAY_ENVIRONMENT) {
  load('.env')
  load('.env.local')
}

const account = process.env.R2_ACCOUNT_ID?.trim()
const accessKey = process.env.R2_ACCESS_KEY_ID?.trim()
const secret = process.env.R2_SECRET_ACCESS_KEY?.trim()
const bucket = (process.env.R2_BUCKET_NAME || 'cinema-media').trim()
const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
if (!account || !accessKey || !secret) {
  console.error('R2 credentials are missing')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${account}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKey, secretAccessKey: secret },
})

const dbUrl = (process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL || '').trim()
if (!dbUrl) {
  console.error('NO_DATABASE_URL')
  process.exit(1)
}
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const clips = await client.query(`
  SELECT c.id, c."videoUrl", c."rawVideoUrl", s."projectId"
  FROM "StudioClip" c
  JOIN "StudioScene" s ON s.id = c."sceneId"
  WHERE c.status = 'COMPLETED' AND c."storageKey" IS NULL AND c."videoUrl" IS NOT NULL
`)

let mirrored = 0
let mediaLost = 0
for (const clip of clips.rows) {
  const source = String(clip.rawVideoUrl || clip.videoUrl || '').trim()
  if (!source) continue
  const key = `clips/${clip.projectId}/${clip.id}.mp4`
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    const stored = publicBase ? `${publicBase}/${key}` : key
    await client.query(
      `UPDATE "StudioClip" SET "storageKey" = $2, "videoUrl" = $3, "rawVideoUrl" = COALESCE("rawVideoUrl", "videoUrl") WHERE id = $1`,
      [clip.id, key, stored],
    )
    mirrored += 1
    console.log(`mirrored-existing ${clip.id}`)
    continue
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/credential|InvalidAccessKey|SignatureDoesNotMatch|not valid/i.test(message)) throw err
  }
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(120_000), headers: { Accept: 'video/*,*/*' } })
    if (!res.ok) throw new Error(`mirror fetch ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 1024) throw new Error('Mirrored clip video is too small')
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'video/mp4' }))
    const stored = publicBase ? `${publicBase}/${key}` : key
    await client.query(
      `UPDATE "StudioClip" SET "storageKey" = $2, "videoUrl" = $3, "rawVideoUrl" = COALESCE("rawVideoUrl", $4) WHERE id = $1`,
      [clip.id, key, stored, source],
    )
    mirrored += 1
    console.log(`mirrored ${clip.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'download failed'
    if (!/mirror fetch 4\d\d/.test(message) && !/too small/.test(message)) throw err
    await client.query(
      `UPDATE "StudioClip" SET "statusReason" = $2 WHERE id = $1`,
      [clip.id, 'media-lost: the provider URL is expired or unreadable. The clip was kept.'],
    )
    mediaLost += 1
    console.log(`media-lost ${clip.id}`)
  }
}

console.log(JSON.stringify({ scanned: clips.rows.length, mirrored, mediaLost }))
await client.end()
