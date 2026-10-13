const CESIUM_BASE = 'https://api.cesium.com/v1'

export interface AerialPathParams {
  startLat:  number
  startLng:  number
  endLat:    number
  endLng:    number
  altitude?: number
}

export async function getAerialPathAssets(
  params: AerialPathParams
): Promise<{
  terrainAssetId: number
  tilesetUrl:     string
  waypoints:      Array<{ lat: number; lng: number; alt: number }>
}> {
  const token = process.env.CESIUM_ION_ACCESS_TOKEN!

  const terrainAssetId = 1
  const tilesetAssetId = 2275207

  const res = await fetch(`${CESIUM_BASE}/assets/${tilesetAssetId}/endpoint`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Cesium error: ${await res.text()}`)
  const data = await res.json() as { url?: string }

  const steps     = 10
  const waypoints = Array.from({ length: steps + 1 }, (_, i) => ({
    lat: params.startLat + (params.endLat - params.startLat) * (i / steps),
    lng: params.startLng + (params.endLng - params.startLng) * (i / steps),
    alt: params.altitude ?? 300,
  }))

  return {
    terrainAssetId,
    tilesetUrl: data.url ?? '',
    waypoints,
  }
}
