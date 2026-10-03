import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
  class: string
  address?: {
    country?: string
    city?: string
    town?: string
    suburb?: string
    neighbourhood?: string
    road?: string
    state?: string
  }
}

export async function geocodeLocation(query: string): Promise<NominatimResult | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
    {
      headers: {
        'User-Agent': 'CINEMA-App/1.0 (contact@cinema.app)',
        'Accept-Language': 'en',
      },
    }
  )

  if (!res.ok) return null

  const results = await res.json() as NominatimResult[]
  return results[0] ?? null
}

export async function buildGenerativeLocationPrompt(
  placeDescription: string
): Promise<string> {
  // First try geocoding
  const geoResult = await geocodeLocation(placeDescription)

  let locationContext = placeDescription

  if (geoResult) {
    const addr = geoResult.address ?? {}
    const parts = [
      addr.neighbourhood ?? addr.suburb,
      addr.city ?? addr.town,
      addr.state,
      addr.country,
      `(${geoResult.type} - ${geoResult.class})`,
    ].filter(Boolean)

    locationContext = `${placeDescription} — ${parts.join(', ')}`
  }

  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `You are a cinematographer. Write a detailed video generation prompt for this location: "${locationContext}"

Include: lighting conditions, architectural materials, atmosphere, time of day, camera angle, weather, ambient sounds implied visually, color palette.

Write only the prompt text, no explanations. 2-3 sentences maximum.`,
      },
    ],
  }, { source: 'location.osm' })

  const text = claudeText(response) || placeDescription
  return text.trim()
}

export async function getLocationMetadata(lat: number, lng: number): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    {
      headers: { 'User-Agent': 'CINEMA-App/1.0 (contact@cinema.app)' },
    }
  )

  if (!res.ok) return {}
  return res.json() as Promise<Record<string, unknown>>
}
