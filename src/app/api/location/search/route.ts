import { NextRequest, NextResponse } from 'next/server'
import { geocodeLocation }                        from '@/lib/engines/geocode'
import { searchStreetView }                       from '@/lib/engines/mapillary'
import { getSatelliteImageUrls, getCesiumConfig } from '@/lib/engines/satellite'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.MAPILLARY_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'MAPILLARY_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch (err) {
    console.warn("[caught] src/app/api/location/search/route.ts:17", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  const radius = typeof body.radius === 'number' && body.radius > 0 ? body.radius : 150

  try {
    const location   = await geocodeLocation(query)
    const { lat, lng } = location

    const [streetView, satellite] = await Promise.all([
      searchStreetView({ lat, lng, radius, limit: 24 }),
      Promise.resolve(getSatelliteImageUrls(lat, lng)),
    ])
    const cesium = getCesiumConfig(lat, lng, location.displayName)

    return NextResponse.json({
      location,
      streetView,
      satellite,
      cesium,
      meta: {
        streetViewCount: streetView.length,
        hasStreetView:   streetView.length > 0,
        hasSatellite:    true,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Location search failed'
    console.error('[api/location/search]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
