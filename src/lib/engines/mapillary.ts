const MAPILLARY_BASE = 'https://graph.mapillary.com'

export interface MapillarySearchParams {
  lat:     number
  lng:     number
  radius?: number
  limit?:  number
}

interface MapillaryImage {
  id:           string
  thumb_2048_url: string
  captured_at:  string
  geometry?:    { coordinates?: [number, number] }
}

export async function searchLocationImagery(
  params: MapillarySearchParams
): Promise<Array<{
  id:          string
  thumbUrl:    string
  capturedAt:  string
  lat:         number
  lng:         number
}>> {
  const token  = process.env.MAPILLARY_ACCESS_TOKEN!
  const radius = params.radius ?? 100
  const delta  = radius / 111000

  const bbox = [
    params.lng - delta, params.lat - delta,
    params.lng + delta, params.lat + delta,
  ].join(',')

  const url = `${MAPILLARY_BASE}/images?` +
    `access_token=${token}&` +
    `fields=id,thumb_2048_url,captured_at,geometry&` +
    `bbox=${bbox}&` +
    `limit=${params.limit ?? 10}`

  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Mapillary error: ${await res.text()}`)
  const data = await res.json() as { data?: MapillaryImage[] }

  return (data.data ?? []).map(img => ({
    id:         img.id,
    thumbUrl:   img.thumb_2048_url,
    capturedAt: img.captured_at,
    lat:        img.geometry?.coordinates?.[1] ?? params.lat,
    lng:        img.geometry?.coordinates?.[0] ?? params.lng,
  }))
}
