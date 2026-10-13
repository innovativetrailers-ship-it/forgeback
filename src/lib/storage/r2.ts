import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME ?? 'cinema-media'
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? ''

export async function uploadToR2(
  buffer: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  return `${PUBLIC_URL}/${key}`
}

export async function getSignedUploadUrl(
  folder: string,
  extension: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const key = `${folder}/${nanoid()}.${extension}`
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key })
  const uploadUrl = await getSignedUrl(r2, command, { expiresIn })
  return { uploadUrl, publicUrl: `${PUBLIC_URL}/${key}`, key }
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(r2, command, { expiresIn })
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export function keyFromUrl(url: string): string {
  return url.replace(`${PUBLIC_URL}/`, '')
}

export { clipVideoKey, objectKeyFromStored, renderVideoKey } from './keys'

export function publicUrlForKey(key: string): string {
  const base = PUBLIC_URL.replace(/\/$/, '')
  return base ? `${base}/${key}` : key
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err) {
    console.warn("[caught] src/lib/storage/r2.ts:83", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
