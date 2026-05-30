const PEXELS_BASE = 'https://api.pexels.com'

export interface StockSearchParams {
  query:    string
  type:     'photo' | 'video'
  page?:    number
  perPage?: number
}

interface PexelsVideo {
  id:          number
  width:       number
  height:      number
  image:       string
  video_files: Array<{ link: string }>
  user?:       { name?: string }
}

interface PexelsPhoto {
  id:           number
  width:        number
  height:       number
  src?:         { original?: string; medium?: string }
  photographer?: string
}

export async function searchStock(
  params: StockSearchParams
): Promise<Array<{
  id:       string
  url:      string
  thumbUrl: string
  type:     'photo' | 'video'
  width:    number
  height:   number
  author:   string
}>> {
  const key      = process.env.PEXELS_API_KEY!
  const endpoint = params.type === 'video'
    ? `${PEXELS_BASE}/videos/search`
    : `${PEXELS_BASE}/v1/search`

  const url = `${endpoint}?query=${encodeURIComponent(params.query)}&` +
    `page=${params.page ?? 1}&per_page=${params.perPage ?? 15}`

  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) throw new Error(`Pexels error: ${await res.text()}`)
  const data = await res.json() as { videos?: PexelsVideo[]; photos?: PexelsPhoto[] }

  if (params.type === 'video') {
    return (data.videos ?? []).map(v => ({
      id:       String(v.id),
      url:      v.video_files?.[0]?.link ?? '',
      thumbUrl: v.image,
      type:     'video' as const,
      width:    v.width,
      height:   v.height,
      author:   v.user?.name ?? 'Pexels',
    }))
  }

  return (data.photos ?? []).map(p => ({
    id:       String(p.id),
    url:      p.src?.original ?? '',
    thumbUrl: p.src?.medium ?? '',
    type:     'photo' as const,
    width:    p.width,
    height:   p.height,
    author:   p.photographer ?? 'Pexels',
  }))
}
