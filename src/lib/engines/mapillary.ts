import { MAPILLARY_LICENCE, rankScoutFrames, type ScoutFrame } from '@cinema/core'

const MAPILLARY_BASE = 'https://graph.mapillary.com'

interface RawMapillaryImage {
  id: string
  thumb_1024_url?: string
  thumb_2048_url?: string
  thumb_original_url?: string
  captured_at?: string
  geometry?: { coordinates?: [number, number] }
  compass_angle?: number
  is_pano?: boolean
  camera_type?: string
  width?: number
  height?: number
}

function bbox(lat: number, lng: number, radius: number): string {
  const dLat = radius / 111320
  const dLng = radius / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join(',')
}

function toFrame(img: RawMapillaryImage, fallback: { lat: number; lng: number }): ScoutFrame {
  return {
    id: img.id,
    thumbUrl: img.thumb_1024_url || img.thumb_2048_url || '',
    fullUrl: img.thumb_original_url || img.thumb_2048_url || img.thumb_1024_url || '',
    capturedAt: img.captured_at ?? '',
    lat: img.geometry?.coordinates?.[1] ?? fallback.lat,
    lng: img.geometry?.coordinates?.[0] ?? fallback.lng,
    compassAngle: img.compass_angle,
    isPano: img.is_pano === true || img.camera_type === 'equirectangular' || img.camera_type === 'spherical',
    cameraType: img.camera_type ?? 'unknown',
    width: img.width ?? 0,
    height: img.height ?? 0,
    licence: MAPILLARY_LICENCE,
    source: 'mapillary',
  }
}

async function fetchBox(lat: number, lng: number, radius: number): Promise<ScoutFrame[]> {
  const token = process.env.MAPILLARY_ACCESS_TOKEN
  if (!token) throw new Error('MAPILLARY_ACCESS_TOKEN not configured')
  const url = `${MAPILLARY_BASE}/images?` + new URLSearchParams({
    access_token: token,
    fields: 'id,thumb_1024_url,thumb_2048_url,thumb_original_url,captured_at,geometry,compass_angle,is_pano,camera_type,width,height',
    bbox: bbox(lat, lng, radius),
    limit: '50',
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mapillary search failed (${res.status})`)
  const data = await res.json() as { data?: RawMapillaryImage[] }
  return (data.data ?? []).map((img) => toFrame(img, { lat, lng }))
}

export async function searchStreetView(params: {
  points: Array<{ lat: number; lng: number }>
  radius?: number
}): Promise<{ shown: ScoutFrame[]; filtered: ScoutFrame[] }> {
  const radius = params.radius ?? 70
  const frames: ScoutFrame[] = []
  let lastError: Error | null = null
  for (const point of params.points.slice(0, 6)) {
    try {
      frames.push(...await fetchBox(point.lat, point.lng, radius))
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Mapillary search failed')
      console.warn('[mapillary]', lastError.message)
    }
  }
  if (!frames.length && lastError) throw lastError
  return rankScoutFrames(frames)
}
