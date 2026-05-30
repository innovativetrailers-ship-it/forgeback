import { getAerialPathAssets } from '@/lib/engines/cesium'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    startLat?: number
    startLng?: number
    endLat?:   number
    endLng?:   number
    altitude?: number
  }
  const { startLat, startLng, endLat, endLng, altitude } = body

  if (startLat == null || startLng == null || endLat == null || endLng == null) {
    return Response.json({ error: 'startLat, startLng, endLat, endLng required' }, { status: 400 })
  }

  const assets = await getAerialPathAssets({ startLat, startLng, endLat, endLng, altitude })
  return Response.json(assets)
}
