import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

export const releasesR2 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const RELEASES_BUCKET =
  process.env.R2_RELEASES_BUCKET ?? process.env.R2_BUCKET_NAME ?? 'forge-releases'

/** Object key prefix when installers live under the main media bucket. */
export function releaseObjectKey(filename: string): string {
  const raw =
    process.env.R2_RELEASES_PREFIX ??
    process.env.DESKTOP_RELEASES_PREFIX
  const prefix =
    raw !== undefined
      ? raw.trim().replace(/^\/+|\/+$/g, '')
      : process.env.R2_RELEASES_BUCKET === 'forge-releases'
        ? ''
        : 'releases'
  return prefix ? `${prefix}/${filename}` : filename
}

export async function releaseObjectExists(key: string): Promise<boolean> {
  try {
    await releasesR2.send(new HeadObjectCommand({ Bucket: RELEASES_BUCKET, Key: key }))
    return true
  } catch (err) {
    console.warn("[caught] src/lib/storage/releasesR2.ts:40", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}

export async function getSignedReleaseUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: RELEASES_BUCKET, Key: key })
  return getSignedUrl(releasesR2, command, { expiresIn })
}
