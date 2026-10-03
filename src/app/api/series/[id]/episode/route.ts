import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { SeriesManager } from '@/lib/series/SeriesManager'

const manager = new SeriesManager()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: seriesId } = await params
  const body = await req.json() as {
    seasonNumber: number
    episodeNumber: number
    episodeBrief: string
    tier?: 'Draft' | 'Studio' | 'Blockbuster'
    isSocial?: boolean
    topic?: string
  }

  const series = await db.seriesProject.findUnique({ where: { id: seriesId } })
  if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 })
  if (series.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const creditKey = body.isSocial ? 'social_episode' : 'episode_production'
  try {
    await checkAndDeductCredits(userId, creditKey)
  } catch (err) {
    console.warn("[caught] src/app/api/series/[id]/episode/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send({ status: 'started', episodeNumber: body.episodeNumber })

        let outputUrl: string

        if (body.isSocial && body.topic) {
          outputUrl = await manager.generateSocialEpisode({
            seriesId,
            episodeNumber: body.episodeNumber,
            topic: body.topic,
            tier: body.tier ?? 'Studio',
            userId,
          })
        } else {
          outputUrl = await manager.generateEpisode({
            seriesId,
            seasonNumber: body.seasonNumber,
            episodeNumber: body.episodeNumber,
            episodeBrief: body.episodeBrief,
            tier: body.tier ?? 'Studio',
            userId,
          })
        }

        send({ status: 'complete', outputUrl })
        controller.close()
      } catch (err) {
        console.warn("[caught] src/app/api/series/[id]/episode/route.ts:71", err instanceof Error ? { name: err.name, message: err.message } : err)

        await refundOperationCredits(userId, creditKey)
        send({ status: 'error', error: err instanceof Error ? err.message : 'Episode generation failed' })
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
