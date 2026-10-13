import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'
import { allowRate } from '@/lib/http/rateLimit'
import { opaqueObjectKey, sniffMedia } from '@/lib/upload/sniff'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allowRate(`upload-image:${userId}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const sniffed = sniffMedia(buffer)
  if (!sniffed || !sniffed.mime.startsWith('image/')) {
    return NextResponse.json({ error: 'File contents are not an allowed image' }, { status: 400 })
  }
  const key = opaqueObjectKey(sniffed.ext)
  const url = await uploadToR2(buffer, key, sniffed.mime)
  return NextResponse.json({ url }, { headers: { 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment' } })
}
