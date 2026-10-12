import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { opaqueObjectKey } from '@/lib/upload/sniff'

export async function rememberObject(ownerId: string | null | undefined, key: string): Promise<void> {
  if (!ownerId) return
  await db.storedObject.create({ data: { ownerId, storageKey: key } }).catch((err) => {
    console.warn('[storage] map', err instanceof Error ? err.message : err)
  })
}

/** New bytes go under an opaque key. The owner is a database row, not part of the key. */
export async function storeForUser(
  ownerId: string | null | undefined,
  buffer: Buffer | Uint8Array,
  ext: string,
  contentType: string,
): Promise<string> {
  const key = opaqueObjectKey(ext.replace(/^\./, '') || 'bin')
  const url = await uploadToR2(buffer, key, contentType)
  await rememberObject(ownerId, key)
  return url
}
