import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const PEXELS_LICENCE = 'Pexels License — free to use, including commercially. Attribution is appreciated and is stored with the file. This copy is not used to train models.'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[stock-import]', err instanceof Error ? err.message : err)
    return null
  }) as { url?: string; thumbUrl?: string; author?: string; type?: string; title?: string } | null
  const url = body?.url?.trim() ?? ''
  let host = ''
  try {
    host = new URL(url).hostname
  } catch (err) {
    console.warn('[stock-import]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'A Pexels file URL is required' }, { status: 400 })
  }
  if (!host.endsWith('pexels.com')) {
    return NextResponse.json({ error: 'Only a Pexels file can be copied into the library.' }, { status: 400 })
  }
  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: 'Pexels did not return the file' }, { status: 502 })
    const type = body?.type === 'video' ? 'video' : 'image'
    const stored = await uploadToR2(
      Buffer.from(await res.arrayBuffer()),
      `stock/${userId}/${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`,
      type === 'video' ? 'video/mp4' : 'image/jpeg',
    )
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'asset',
        label: body?.title || `Pexels ${type}`,
        mediaKind: type,
        generatedImage: stored,
        resolutionState: 'imported',
        usableAsReference: true,
        isPrimary: true,
        boundary: {
          provider: 'pexels',
          licence: PEXELS_LICENCE,
          author: body?.author || 'Pexels',
          attribution: body?.author ? `Photo/video by ${body.author} on Pexels` : 'Pexels',
          sourceHost: host,
        },
      },
      select: { id: true },
    })
    return NextResponse.json({ assetId: asset.id, url: stored, licence: PEXELS_LICENCE, libraryTake: true })
  } catch (err) {
    console.warn('[stock-import]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The file was not copied' }, { status: 502 })
  }
}
