const PEXELS_BASE = 'https://api.pexels.com'
const FMA_BASE = 'https://freemusicarchive.org/api'

export interface StockAsset {
  id: string
  source: 'pexels' | 'fma' | 'cinema_sfx' | 'pixabay'
  type: 'video' | 'audio' | 'sfx'
  title: string
  previewUrl: string
  downloadUrl: string
  duration?: number
  license: string
  tags: string[]
}

export async function searchStockVideo(
  query: string,
  count: number = 20
): Promise<StockAsset[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return []

  const resp = await fetch(
    `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(query)}&per_page=${count}`,
    { headers: { Authorization: apiKey } }
  )

  if (!resp.ok) return []

  const data = await resp.json() as {
    videos: Array<{
      id: number
      duration: number
      url: string
      image: string
      video_files: Array<{ quality: string; link: string }>
      tags?: string[]
    }>
  }

  return data.videos.map((v) => ({
    id: String(v.id),
    source: 'pexels' as const,
    type: 'video' as const,
    title: `Pexels Video ${v.id}`,
    previewUrl: v.image,
    downloadUrl: v.video_files.find((f) => f.quality === 'hd')?.link ?? v.video_files[0]?.link ?? '',
    duration: v.duration,
    license: 'Pexels License (free commercial use)',
    tags: v.tags ?? [],
  }))
}

export async function searchStockMusic(
  query: string,
  mood?: string
): Promise<StockAsset[]> {
  const searchQuery = mood ? `${query} ${mood}` : query

  try {
    const resp = await fetch(
      `${FMA_BASE}/get/track.json?title=${encodeURIComponent(searchQuery)}&limit=20`
    )
    if (!resp.ok) return []

    const data = await resp.json() as {
      dataset?: Array<{
        track_id: string
        track_title: string
        track_url: string
        track_image_file?: string
        track_duration?: string
        track_genres?: Array<{ genre_title: string }>
      }>
    }

    return (data.dataset ?? []).map((track) => ({
      id: track.track_id,
      source: 'fma' as const,
      type: 'audio' as const,
      title: track.track_title,
      previewUrl: track.track_image_file ?? '',
      downloadUrl: track.track_url,
      duration: track.track_duration ? parseFloat(track.track_duration) : undefined,
      license: 'Creative Commons',
      tags: track.track_genres?.map((g) => g.genre_title) ?? [],
    }))
  } catch (err) {
    console.warn("[caught] src/lib/stock/StockLibrary.ts:88", err instanceof Error ? { name: err.name, message: err.message } : err)

    return []
  }
}

export async function searchSFX(
  query: string,
  category?: string
): Promise<StockAsset[]> {
  // Cinema SFX library — curated 500+ effects hosted on R2
  const r2PublicUrl = process.env.R2_PUBLIC_URL ?? ''

  // Category-based SFX index (sample structured data)
  const SFX_INDEX: Record<string, Array<{ id: string; title: string; file: string; tags: string[] }>> = {
    footsteps: [
      { id: 'sfx_001', title: 'Footsteps on concrete', file: 'sfx/footsteps/concrete_01.mp3', tags: ['footsteps', 'concrete', 'walking'] },
      { id: 'sfx_002', title: 'Footsteps on gravel', file: 'sfx/footsteps/gravel_01.mp3', tags: ['footsteps', 'gravel', 'walking'] },
    ],
    ambient: [
      { id: 'sfx_010', title: 'City ambience day', file: 'sfx/ambient/city_day.mp3', tags: ['city', 'ambient', 'urban'] },
      { id: 'sfx_011', title: 'Forest birds', file: 'sfx/ambient/forest_birds.mp3', tags: ['nature', 'birds', 'forest'] },
    ],
    weather: [
      { id: 'sfx_020', title: 'Heavy rain', file: 'sfx/weather/rain_heavy.mp3', tags: ['rain', 'weather', 'storm'] },
      { id: 'sfx_021', title: 'Thunder crack', file: 'sfx/weather/thunder.mp3', tags: ['thunder', 'storm', 'lightning'] },
    ],
  }

  const searchLower = query.toLowerCase()
  const pool = category ? (SFX_INDEX[category] ?? []) : Object.values(SFX_INDEX).flat()

  const results = pool.filter(
    (sfx) =>
      sfx.title.toLowerCase().includes(searchLower) ||
      sfx.tags.some((t) => t.includes(searchLower))
  )

  return results.map((sfx) => ({
    id: sfx.id,
    source: 'cinema_sfx' as const,
    type: 'sfx' as const,
    title: sfx.title,
    previewUrl: `${r2PublicUrl}/${sfx.file}`,
    downloadUrl: `${r2PublicUrl}/${sfx.file}`,
    license: 'Cinema SFX Library (royalty-free)',
    tags: sfx.tags,
  }))
}
