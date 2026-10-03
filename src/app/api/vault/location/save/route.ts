import { NextRequest, NextResponse } from 'next/server'
import { db }          from '@/lib/db'
import { uploadToR2 }  from '@/lib/storage/r2'

interface LocationMeta {
  lat?:         number
  lng?:         number
  displayName?: string
  city?:        string
  country?:     string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let imageUrl: string, type: string, location: LocationMeta | undefined
  try {
    const body = await req.json() as { imageUrl?: unknown; type?: unknown; location?: unknown }
    imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''
    type     = typeof body.type === 'string' ? body.type : 'satellite'
    location = (body.location as LocationMeta | undefined) ?? undefined
  } catch (err) {
    console.warn("[caught] src/app/api/vault/location/save/route.ts:23", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })
  }

  try {
    const imgBuffer = await fetch(imageUrl).then(r => r.arrayBuffer())
    const r2Url     = await uploadToR2(
      Buffer.from(imgBuffer),
      `location-plates/${userId}/${Date.now()}.jpg`,
      'image/jpeg',
    )

    const plate = await db.locationPlate.create({
      data: {
        userId,
        imageUrl:    r2Url,
        sourceUrl:   imageUrl,
        type,
        lat:         location?.lat,
        lng:         location?.lng,
        displayName: location?.displayName,
        city:        location?.city,
        country:     location?.country,
      },
    })
    const label = location?.displayName || location?.city || type
    await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'location',
        sourcePrompt: label,
        sourceRefs: [r2Url],
        generatedImage: r2Url,
        usableAsReference: true,
        isPrimary: true,
        label,
        mediaKind: 'image',
      },
    })

    return NextResponse.json({ saved: true, plateId: plate.id, imageUrl: r2Url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save location plate'
    console.error('[vault/location/save]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
