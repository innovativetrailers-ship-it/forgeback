import { rankGeoHits, sampleAlong, type GeoHit } from '@cinema/core'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'CinematicForge/1.0 (location-scout)'

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  boundingbox?: [string, string, string, string]
  geojson?: { type?: string; coordinates?: unknown }
  address?: {
    road?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
    country?: string
  }
}

function lineFromGeo(geo: NominatimResult['geojson']): Array<[number, number]> | undefined {
  if (!geo?.coordinates) return undefined
  if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) return geo.coordinates as Array<[number, number]>
  if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)) {
    return (geo.coordinates as Array<Array<[number, number]>>).flat()
  }
  return undefined
}

function toHit(row: NominatimResult): GeoHit {
  const box = row.boundingbox
  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    displayName: row.display_name,
    street: row.address?.road,
    suburb: row.address?.suburb,
    city: row.address?.city || row.address?.town || row.address?.village,
    state: row.address?.state,
    postcode: row.address?.postcode,
    country: row.address?.country,
    kind: `${row.class ?? 'place'}:${row.type ?? 'yes'}`,
    bbox: box ? [Number(box[0]), Number(box[1]), Number(box[2]), Number(box[3])] : undefined,
    line: lineFromGeo(row.geojson),
  }
}

function parseGPS(input: string): { lat: number; lng: number } | null {
  const decimal = input.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/)
  if (!decimal) return null
  const lat = Number(decimal[1])
  const lng = Number(decimal[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

async function nominatim(path: string): Promise<NominatimResult[]> {
  const res = await fetch(`${NOMINATIM}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoder failed (${res.status})`)
  const data = await res.json() as NominatimResult | NominatimResult[]
  return Array.isArray(data) ? data : [data]
}

export async function suggestPlaces(query: string): Promise<GeoHit[]> {
  const text = query.trim()
  if (!text) return []
  const gps = parseGPS(text)
  if (gps) {
    const rows = await nominatim(`/reverse?lat=${gps.lat}&lon=${gps.lng}&format=json&addressdetails=1`)
    const hit = rows[0] ? toHit({ ...rows[0], lat: String(gps.lat), lon: String(gps.lng) }) : {
      lat: gps.lat, lng: gps.lng, displayName: `${gps.lat}, ${gps.lng}`, kind: 'place:coordinate',
    }
    return [hit]
  }
  const rows = await nominatim(`/search?q=${encodeURIComponent(text)}&format=json&limit=6&addressdetails=1&polygon_geojson=1`)
  if (!rows.length) throw new Error(`Location not found: "${text}"`)
  return rankGeoHits(rows.map(toHit), text)
}

export async function geocodeLocation(query: string): Promise<GeoHit & { samples: Array<{ lat: number; lng: number }> }> {
  const hits = await suggestPlaces(query)
  const place = hits[0]
  if (!place) throw new Error(`Location not found: "${query}"`)
  return { ...place, samples: sampleAlong(place.line, { lat: place.lat, lng: place.lng }) }
}

export { sampleAlong }
