/** Shared location-scout ranking. Web and desktop both call this. No network. */

export interface GeoHit {
  lat: number
  lng: number
  displayName: string
  street?: string
  suburb?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  kind: string
  bbox?: [number, number, number, number]
  line?: Array<[number, number]>
}

export interface ScoutFrame {
  id: string
  thumbUrl: string
  fullUrl: string
  capturedAt: string
  lat: number
  lng: number
  compassAngle?: number
  isPano: boolean
  cameraType: string
  width: number
  height: number
  licence: string
  source: 'mapillary' | 'upload'
  filteredReason?: string
}

const STREET = /\b(st|street|rd|road|ave|avenue|ln|lane|dr|drive|way|pde|parade|hwy|highway|blvd)\b/i

export function rankGeoHits(hits: GeoHit[], query: string): GeoHit[] {
  const q = query.toLowerCase()
  const wantsStreet = STREET.test(query)
  const scored = hits.map((hit) => {
    let score = 0
    if (hit.kind.startsWith('highway')) score += 5
    if (hit.street && q.includes(hit.street.toLowerCase().replace(/\s+street$/, ' st').slice(0, 6))) score += 2
    if (hit.street && q.includes(hit.street.split(' ')[0]?.toLowerCase() ?? '')) score += 2
    if (hit.postcode && q.includes(hit.postcode)) score += 2
    if (hit.state && q.includes(hit.state.toLowerCase())) score += 1
    if (hit.city && q.includes(hit.city.toLowerCase())) score += 1
    if (wantsStreet && (hit.kind.startsWith('place') || hit.kind.startsWith('boundary'))) score -= 4
    if ((hit.line?.length ?? 0) > 2) score += 1
    return { hit, score }
  })
  return scored.sort((a, b) => b.score - a.score).map((row) => row.hit)
}

export function sampleAlong(line: Array<[number, number]> | undefined, fallback: { lat: number; lng: number }, spacingM = 90, cap = 6): Array<{ lat: number; lng: number }> {
  if (!line || line.length < 2) return [fallback]
  const points = [{ lat: line[0][1], lng: line[0][0] }]
  let walked = 0
  for (let i = 1; i < line.length; i++) {
    walked += haversine(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0])
    if (walked >= spacingM) {
      points.push({ lat: line[i][1], lng: line[i][0] })
      walked = 0
      if (points.length >= cap) return points
    }
  }
  const last = line[line.length - 1]
  const end = { lat: last[1], lng: last[0] }
  if (points.length < cap && haversine(points[points.length - 1].lat, points[points.length - 1].lng, end.lat, end.lng) > 20) {
    points.push(end)
  }
  return points
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function scoutDropReason(cameraType: string, width: number): string | null {
  const cam = cameraType.toLowerCase()
  if (cam.includes('fisheye') || cam.includes('action')) return 'fisheye'
  if (width > 0 && width < 1024) return 'low-resolution'
  return null
}

function better(a: ScoutFrame, b: ScoutFrame): boolean {
  if (a.isPano !== b.isPano) return a.isPano
  if ((a.width || 0) !== (b.width || 0)) return (a.width || 0) > (b.width || 0)
  return a.capturedAt > b.capturedAt
}

export function rankScoutFrames(frames: ScoutFrame[]): { shown: ScoutFrame[]; filtered: ScoutFrame[] } {
  const filtered: ScoutFrame[] = []
  const kept: ScoutFrame[] = []
  const seen = new Set<string>()
  for (const frame of frames) {
    if (seen.has(frame.id)) continue
    seen.add(frame.id)
    const reason = scoutDropReason(frame.cameraType, frame.width)
    if (reason) filtered.push({ ...frame, filteredReason: reason })
    else kept.push(frame)
  }
  const clusters = new Map<string, ScoutFrame>()
  for (const frame of kept) {
    const key = `${frame.lat.toFixed(4)}:${frame.lng.toFixed(4)}:${Math.round((frame.compassAngle ?? 0) / 45)}`
    const prev = clusters.get(key)
    if (!prev) clusters.set(key, frame)
    else if (better(frame, prev)) {
      filtered.push({ ...prev, filteredReason: 'near-duplicate' })
      clusters.set(key, frame)
    } else {
      filtered.push({ ...frame, filteredReason: 'near-duplicate' })
    }
  }
  const shown = [...clusters.values()].sort((a, b) => (better(a, b) ? -1 : 1))
  return { shown, filtered }
}

export const MAPILLARY_LICENCE = 'CC BY-SA 4.0 — attribute Mapillary contributors'
export const GOOGLE_IMAGERY_NOTE = 'Google Maps Content may not be cached or used to create new content (Maps Platform Terms, No Caching / No Creating Content From Google Maps Content). Street View is not connected and is never saved.'

export function scoutPlatePrompt(input: {
  name: string
  note?: string
  lat?: number
  lng?: number
  street?: string
  height?: number
  heading?: number
  pitch?: number
  fov?: number
  time?: string
  season?: string
  weather?: string
}): string {
  const name = input.name.trim()
  if (name.length < 3) throw new Error('Name the place')
  const where = [input.street, input.lat != null && input.lng != null ? `${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}` : '']
    .filter(Boolean)
    .join(', ')
  return [
    `Photoreal establishing photograph of ${name}.`,
    where ? `Place: ${where}.` : '',
    input.note?.trim() ?? '',
    `Camera height ${input.height ?? 2}m, heading ${input.heading ?? 0}°, pitch ${input.pitch ?? 0}°, field of view ${input.fov ?? 50}°.`,
    `${input.time ?? 'day'}, ${input.season ?? 'summer'}, ${input.weather ?? 'clear'}.`,
    'Match the real street layout. No people in the foreground, no text, no watermark.',
  ].filter(Boolean).join(' ')
}
