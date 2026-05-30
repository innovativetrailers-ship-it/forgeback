import { searchLocationImagery } from '@/lib/engines/mapillary'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lat    = parseFloat(searchParams.get('lat') ?? '0')
  const lng    = parseFloat(searchParams.get('lng') ?? '0')
  const radius = parseInt(searchParams.get('radius') ?? '100')

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const images = await searchLocationImagery({ lat, lng, radius })
  return Response.json({ images })
}
