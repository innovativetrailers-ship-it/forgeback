import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { SeriesManager } from '@/lib/series/SeriesManager'

const manager = new SeriesManager()

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    title: string
    type: string
    platform: string
    concept: string
    episodeRuntime: number
    episodeCount?: number
    commit?: boolean
  }

  if (!body.title || !body.type || !body.platform || !body.concept || !body.episodeRuntime) {
    return NextResponse.json({ error: 'title, type, platform, concept and episodeRuntime are required' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, 'series_bible_generation')
  } catch (err) {
    console.warn("[caught] src/app/api/series/create/route.ts:30", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  try {
    const bible = await manager.generateSeriesBible({
      concept: body.concept,
      type: body.type,
      platform: body.platform,
      episodeCount: body.episodeCount ?? 10,
      episodeRuntime: body.episodeRuntime,
    })

    if (!body.commit) {
      return NextResponse.json({ bible, committed: false })
    }

    const validTypes = ['TV_DRAMA', 'TV_COMEDY', 'WEB_SERIES', 'SOCIAL_SERIES', 'DOCUMENTARY_SERIES', 'ANTHOLOGY']
    const seriesType = validTypes.includes(body.type.toUpperCase())
      ? body.type.toUpperCase()
      : 'WEB_SERIES'

    const series = await db.seriesProject.create({
      data: {
        userId,
        title: body.title,
        type: seriesType as 'TV_DRAMA' | 'TV_COMEDY' | 'WEB_SERIES' | 'SOCIAL_SERIES' | 'DOCUMENTARY_SERIES' | 'ANTHOLOGY',
        platform: body.platform,
        episodeFormat: { runtime: body.episodeRuntime, structure: ['cold_open', 'act_1', 'act_2', 'act_3', 'tag'] } as never,
        seriesBible: bible as never,
        recurringCastIds: [],
        recurringLocationIds: [],
        status: 'development',
      }
    })

    await db.season.create({
      data: { seriesId: series.id, seasonNumber: 1, status: 'planned' }
    })

    return NextResponse.json({ series, bible, committed: true }, { status: 201 })
  } catch (err) {
    console.warn("[caught] src/app/api/series/create/route.ts:71", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundOperationCredits(userId, 'series_bible_generation')
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const series = await db.seriesProject.findMany({
    where: { userId },
    include: { seasons: { include: { episodes: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ series })
}
