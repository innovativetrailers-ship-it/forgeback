import { GOOGLE_IMAGERY_NOTE, MAPILLARY_LICENCE } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

interface LocationMeta {
  lat?: number
  lng?: number
  displayName?: string
  city?: string
  country?: string
  licence?: string
  cameraType?: string
  capturedAt?: string
}

function blockedHost(imageUrl: string): boolean {
  try {
    const host = new URL(imageUrl).hostname
    return /google|ggpht|streetview/i.test(host)
  } catch (err) {
    console.warn('[location-save]', err instanceof Error ? err.message : err)
    return true
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let imageUrl = ''
  let type = 'street'
  let location: LocationMeta | undefined
  try {
    const body = await req.json() as { imageUrl?: unknown; type?: unknown; location?: unknown }
    imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''
    type = typeof body.type === 'string' ? body.type : 'street'
    location = (body.location as LocationMeta | undefined) ?? undefined
  } catch (err) {
    console.warn('[location-save]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })
  if (blockedHost(imageUrl)) {
    return NextResponse.json({ error: GOOGLE_IMAGERY_NOTE }, { status: 400 })
  }

  try {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return NextResponse.json({ error: 'The source image could not be copied' }, { status: 502 })
    const r2Url = await uploadToR2(Buffer.from(await imgRes.arrayBuffer()), `location-plates/${userId}/${Date.now()}.jpg`, 'image/jpeg')
    const label = location?.displayName || location?.city || type
    const licence = location?.licence || (type === 'street' ? MAPILLARY_LICENCE : 'ArcGIS World Imagery, copied into the library')
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'location',
        sourcePrompt: label,
        generatedImage: r2Url,
        usableAsReference: true,
        isPrimary: true,
        label,
        mediaKind: 'image',
        resolutionState: 'imported',
        boundary: {
          source: type === 'street' ? 'real-place-scout' : 'uploaded',
          licence,
          lat: location?.lat,
          lng: location?.lng,
          cameraType: location?.cameraType,
          capturedAt: location?.capturedAt,
        },
      },
      select: { id: true },
    })
    const plate = await db.locationPlate.create({
      data: {
        userId,
        imageUrl: r2Url,
        sourceUrl: r2Url,
        type,
        lat: location?.lat,
        lng: location?.lng,
        displayName: location?.displayName,
        city: location?.city,
        country: location?.country,
        assetId: asset.id,
      },
    })
    return NextResponse.json({ saved: true, plateId: plate.id, assetId: asset.id, imageUrl: r2Url, libraryTake: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save location plate'
    console.error('[vault/location/save]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
