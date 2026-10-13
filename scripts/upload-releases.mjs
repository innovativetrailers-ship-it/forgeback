#!/usr/bin/env node
/**
 * Upload cinematic-forge-v3/dist/installers to R2 for:
 *  - electron-updater (latest-mac.yml / latest.yml + zips + blockmaps at feed root)
 *  - web download API (DMGs/exe under mac-arm/, mac-intel/, windows/)
 *
 * Usage: node scripts/upload-releases.mjs
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *      R2_RELEASES_BUCKET (default forge-releases)
 *      R2_RELEASES_PREFIX (default '' for dedicated bucket; use 'releases' on shared bucket)
 *      DIST_DIR (default ../cinematic-forge-v3/dist/installers)
 */
import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import { createReadStream } from 'fs'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const ROOT = dirname(fileURLToPath(import.meta.url))
config({ path: join(ROOT, '..', '.env.local') })
config({ path: join(ROOT, '..', '.env.vercel') })

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim()
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID?.trim()
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY?.trim()
const BUCKET = process.env.R2_RELEASES_BUCKET ?? 'forge-releases'
const PREFIX_RAW = process.env.R2_RELEASES_PREFIX
const PREFIX =
  PREFIX_RAW !== undefined
    ? PREFIX_RAW.replace(/^\/+|\/+$/g, '')
    : ''
const PREFIX_SLASH = PREFIX ? `${PREFIX}/` : ''
const DIST_DIR =
  process.env.DIST_DIR ?? join(ROOT, '..', 'cinematic-forge-v3', 'dist', 'installers')

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY')
  process.exit(1)
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
})

/** Keys for updater manifests and zip/blockmap pairs (flat at feed root). */
function updaterKey(filename) {
  if (filename === 'latest-mac.yml') return `${PREFIX_SLASH}latest-mac.yml`
  if (filename === 'latest.yml') return `${PREFIX_SLASH}latest.yml`
  if (filename === 'latest-linux.yml') return `${PREFIX_SLASH}latest-linux.yml`
  if (filename.endsWith('.zip') || filename.endsWith('.zip.blockmap')) {
    return `${PREFIX_SLASH}${filename}`
  }
  return null
}

/** Keys for web download page (platform subdirs). */
function webKey(filename) {
  const ext = extname(filename).toLowerCase()
  if (filename.includes('arm64') && ext === '.dmg') return `${PREFIX_SLASH}mac-arm/${filename}`
  if ((filename.includes('x64') || filename.includes('intel')) && ext === '.dmg') {
    return `${PREFIX_SLASH}mac-intel/${filename}`
  }
  if (ext === '.exe' || filename.endsWith('.exe.blockmap')) return `${PREFIX_SLASH}windows/${filename}`
  if (ext === '.msi') return `${PREFIX_SLASH}windows/${filename}`
  if (ext === '.appimage' || ext === '.deb') return `${PREFIX_SLASH}linux/${filename}`
  return null
}

function r2Keys(filename) {
  const keys = new Set()
  const updater = updaterKey(filename)
  if (updater) keys.add(updater)
  const web = webKey(filename)
  if (web) keys.add(web)
  if (keys.size === 0) keys.add(`${PREFIX_SLASH}${filename}`)
  return [...keys]
}

function contentType(filename) {
  const map = {
    '.dmg': 'application/x-apple-diskimage',
    '.exe': 'application/vnd.microsoft.portable-executable',
    '.msi': 'application/x-msi',
    '.zip': 'application/zip',
    '.appimage': 'application/octet-stream',
    '.deb': 'application/vnd.debian.binary-package',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.blockmap': 'application/octet-stream',
  }
  return map[extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

async function upload(localPath, key, filename) {
  const info = await stat(localPath)
  const mb = (info.size / 1024 / 1024).toFixed(1)
  process.stdout.write(`  ↑ ${filename} (${mb} MB) → ${key} ... `)
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType(filename),
      ContentLength: info.size,
      CacheControl: filename.endsWith('.yml') ? 'max-age=60' : 'public, max-age=31536000, immutable',
    }),
  )
  console.log('✓')
}

async function main() {
  await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
  const files = await readdir(DIST_DIR)
  const EXTS = ['.dmg', '.exe', '.msi', '.zip', '.appimage', '.deb', '.yml', '.yaml', '.blockmap']
  const SKIP = new Set(['builder-debug.yml', 'builder-effective-config.yaml'])
  const uploadable = files.filter(
    (f) => EXTS.includes(extname(f).toLowerCase()) && !SKIP.has(f),
  )
  if (!uploadable.length) {
    console.error(`No installer files in ${DIST_DIR}`)
    console.error('Build first: cd cinematic-forge-v3 && npm run dist:mac')
    process.exit(1)
  }

  const hasMacFeed = uploadable.includes('latest-mac.yml')
  const hasWinFeed = uploadable.includes('latest.yml')
  if (!hasMacFeed && !hasWinFeed) {
    console.warn('⚠ No latest-mac.yml / latest.yml — electron-updater will not see a new version')
  }

  console.log(`\nUploading ${uploadable.length} file(s) → s3://${BUCKET}/${PREFIX_SLASH || '(root)'}\n`)
  for (const filename of uploadable) {
    const keys = r2Keys(filename)
    for (const key of keys) {
      await upload(join(DIST_DIR, filename), key, filename)
    }
  }

  const feedBase =
    process.env.DESKTOP_RELEASES_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_DESKTOP_RELEASES_URL?.replace(/\/$/, '') ??
    (process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}${PREFIX ? `/${PREFIX}` : ''}`
      : 'https://releases.forgecinema.app')

  console.log('\n✅ Upload complete.')
  console.log(`   Feed: ${feedBase}/latest-mac.yml`)
  console.log(`   Updater: electron-updater generic @ ${feedBase}`)
  if (hasMacFeed) console.log('   ✓ latest-mac.yml (+ zips/blockmaps) for in-app updates')
  if (hasWinFeed) console.log('   ✓ latest.yml for Windows in-app updates')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
