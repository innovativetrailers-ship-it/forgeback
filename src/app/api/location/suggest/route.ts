import { NextRequest, NextResponse } from 'next/server'
import { suggestPlaces } from '@/lib/engines/geocode'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 3) return NextResponse.json({ suggestions: [] })
  try {
    const suggestions = await suggestPlaces(q)
    return NextResponse.json({
      suggestions: suggestions.map((hit) => ({
        lat: hit.lat,
        lng: hit.lng,
        displayName: hit.displayName,
        street: hit.street,
        suburb: hit.suburb,
        city: hit.city,
        state: hit.state,
        postcode: hit.postcode,
        kind: hit.kind,
        line: hit.line,
      })),
    })
  } catch (err) {
    console.warn('[location-suggest]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Geocoder failed' }, { status: 502 })
  }
}
