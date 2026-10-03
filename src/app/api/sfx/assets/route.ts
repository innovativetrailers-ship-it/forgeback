import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? undefined
  const search   = searchParams.get('q') ?? undefined

  try {
    const assets = await (db as unknown as {
      sFXAsset: {
        findMany: (args: unknown) => Promise<Array<{
          id: string; name: string; category: string; url: string
          previewUrl: string | null; blendMode: string; tags: string[]
        }>>
      }
    }).sFXAsset.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    })
    return NextResponse.json({ assets })
  } catch (err) {
    console.warn("[caught] src/app/api/sfx/assets/route.ts:29", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Graceful fallback — return built-in asset catalog
    const builtIn = BUILT_IN_ASSETS
      .filter((a) => !category || a.category === category)
      .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))
    return NextResponse.json({ assets: builtIn })
  }
}

const BUILT_IN_ASSETS = [
  { id: 'sfx-fire-01',      name: 'Fire Burst',       category: 'fire',     url: '', previewUrl: null, blendMode: 'screen',  tags: ['fire', 'burst'] },
  { id: 'sfx-fire-02',      name: 'Candle Flame',     category: 'fire',     url: '', previewUrl: null, blendMode: 'screen',  tags: ['fire', 'candle'] },
  { id: 'sfx-smoke-01',     name: 'Smoke Puff',       category: 'smoke',    url: '', previewUrl: null, blendMode: 'screen',  tags: ['smoke'] },
  { id: 'sfx-smoke-02',     name: 'Smoke Trail',      category: 'smoke',    url: '', previewUrl: null, blendMode: 'screen',  tags: ['smoke', 'trail'] },
  { id: 'sfx-explosion-01', name: 'Small Explosion',  category: 'vfx',      url: '', previewUrl: null, blendMode: 'screen',  tags: ['explosion'] },
  { id: 'sfx-explosion-02', name: 'Large Explosion',  category: 'vfx',      url: '', previewUrl: null, blendMode: 'screen',  tags: ['explosion', 'large'] },
  { id: 'sfx-magic-01',     name: 'Magic Sparkle',    category: 'magic',    url: '', previewUrl: null, blendMode: 'add',     tags: ['magic', 'sparkle'] },
  { id: 'sfx-magic-02',     name: 'Portal Effect',    category: 'magic',    url: '', previewUrl: null, blendMode: 'add',     tags: ['magic', 'portal'] },
  { id: 'sfx-weather-01',   name: 'Rain Heavy',       category: 'weather',  url: '', previewUrl: null, blendMode: 'screen',  tags: ['rain', 'weather'] },
  { id: 'sfx-weather-02',   name: 'Snow Fall',        category: 'weather',  url: '', previewUrl: null, blendMode: 'screen',  tags: ['snow', 'weather'] },
  { id: 'sfx-weather-03',   name: 'Lightning Strike', category: 'weather',  url: '', previewUrl: null, blendMode: 'screen',  tags: ['lightning', 'weather'] },
  { id: 'sfx-scifi-01',     name: 'Laser Beam',       category: 'sci-fi',   url: '', previewUrl: null, blendMode: 'add',     tags: ['laser', 'sci-fi'] },
  { id: 'sfx-scifi-02',     name: 'Energy Shield',    category: 'sci-fi',   url: '', previewUrl: null, blendMode: 'add',     tags: ['shield', 'sci-fi'] },
  { id: 'sfx-scifi-03',     name: 'Hologram Glitch',  category: 'sci-fi',   url: '', previewUrl: null, blendMode: 'screen',  tags: ['hologram', 'glitch'] },
]
