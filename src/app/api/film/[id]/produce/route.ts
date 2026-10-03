import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { FilmDirector } from '@/lib/film/FilmDirector'

const director = new FilmDirector()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: filmProjectId } = await params
  const body = await req.json() as {
    actId?: string
    tier?: 'Draft' | 'Studio' | 'Blockbuster'
  }

  const tier = body.tier ?? 'Studio'

  const film = await db.filmProject.findUnique({
    where: { id: filmProjectId },
    include: { acts: true },
  })
  if (!film) return NextResponse.json({ error: 'Film not found' }, { status: 404 })
  if (film.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const creditCost = body.actId ? 10 : 100
  const creditKey = body.actId ? 'film_act_assembly' : 'film_full_production'

  try {
    await checkAndDeductCredits(userId, creditKey as Parameters<typeof checkAndDeductCredits>[1])
  } catch (err) {
    console.warn("[caught] src/app/api/film/[id]/produce/route.ts:37", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send({ status: 'started', message: body.actId ? 'Producing act...' : 'Producing full film...' })

        let outputUrl: string

        if (body.actId) {
          send({ status: 'producing_act', actId: body.actId })
          outputUrl = await director.produceAct({
            filmProjectId,
            actId: body.actId,
            tier,
            userId,
          })
        } else {
          send({ status: 'producing_film', filmProjectId })
          outputUrl = await director.produceFullFilm({ filmProjectId, tier, userId })
        }

        await db.filmProject.update({
          where: { id: filmProjectId },
          data: { finalVideoUrl: outputUrl, status: 'COMPLETE' },
        })

        send({ status: 'complete', outputUrl })
        controller.close()
      } catch (err) {
        console.warn("[caught] src/app/api/film/[id]/produce/route.ts:73", err instanceof Error ? { name: err.name, message: err.message } : err)

        await refundOperationCredits(userId, creditKey)
        send({ status: 'error', error: err instanceof Error ? err.message : 'Production failed' })
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
