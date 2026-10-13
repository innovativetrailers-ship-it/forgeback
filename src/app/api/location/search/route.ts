import { GOOGLE_IMAGERY_NOTE, MAPILLARY_LICENCE, sampleAlong, type GeoHit } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { geocodeLocation, suggestPlaces } from '@/lib/engines/geocode'
import { searchStreetView } from '@/lib/engines/mapillary'
import { getSatelliteImageUrls } from '@/lib/engines/satellite'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.MAPILLARY_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'MAPILLARY_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  let body: {
    query?: string
    lat?: number
    lng?: number
    line?: Array<[number, number]>
  }
  try {
    body = await req.json() as typeof body
  } catch (err) {
    console.warn('[location-search]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query && (typeof body.lat !== 'number' || typeof body.lng !== 'number')) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  try {
    const suggestions = query ? await suggestPlaces(query) : []
    const picked = typeof body.lat === 'number' && typeof body.lng === 'number'
      ? suggestions.find((hit) => Math.abs(hit.lat - body.lat!) < 0.0008 && Math.abs(hit.lng - body.lng!) < 0.0008)
      : suggestions[0]
    const base = picked ?? (typeof body.lat === 'number' && typeof body.lng === 'number'
      ? { lat: body.lat, lng: body.lng, displayName: query || `${body.lat}, ${body.lng}`, kind: 'place:pin', line: body.line }
      : await geocodeLocation(query))
    const place: GeoHit = {
      ...base,
      lat: typeof body.lat === 'number' ? body.lat : base.lat,
      lng: typeof body.lng === 'number' ? body.lng : base.lng,
      line: body.line ?? base.line,
    }
    const samples = sampleAlong(place.line, { lat: place.lat, lng: place.lng })
    const street = await searchStreetView({ points: samples })
    const satellite = getSatelliteImageUrls(place.lat, place.lng)
    return NextResponse.json({
      location: place,
      suggestions,
      streetView: street.shown,
      filtered: street.filtered,
      satellite,
      viewer: { lat: place.lat, lng: place.lng, label: place.displayName },
      meta: {
        streetViewCount: street.shown.length,
        filteredCount: street.filtered.length,
        hasStreetView: street.shown.length > 0,
        licence: MAPILLARY_LICENCE,
        google: GOOGLE_IMAGERY_NOTE,
        unavailable: [] as string[],
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Location search failed'
    console.error('[api/location/search]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
