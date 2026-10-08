import { searchStreetView } from '@/lib/engines/mapillary'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const radius = parseInt(searchParams.get('radius') ?? '100', 10)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    const images = await searchStreetView({ points: [{ lat, lng }], radius })
    return Response.json({ images: images.shown, filtered: images.filtered.length })
  } catch (err) {
    console.warn('[location-imagery]', err instanceof Error ? err.message : err)
    return Response.json({ error: err instanceof Error ? err.message : 'Mapillary search failed' }, { status: 502 })
  }
}
