import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { ReferenceVideoAnalyser } from '@/lib/analysis/ReferenceVideoAnalyser'

const analyser = new ReferenceVideoAnalyser()

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    referenceVideoUrl: string
    targetShotListId?: string
    shots?: Record<string, unknown>[]
  }

  if (!body.referenceVideoUrl) {
    return NextResponse.json({ error: 'referenceVideoUrl is required' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, 'reference_style_apply')
  } catch (err) {
    console.warn("[caught] src/app/api/analysis/match-style/route.ts:26", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  try {
    const styleDNA = await analyser.analyseReference({
      videoUrl: body.referenceVideoUrl,
      analysisDepth: 'standard',
    })

    let shots: Record<string, unknown>[] = body.shots ?? []

    if (body.targetShotListId && shots.length === 0) {
      const job = await db.renderJob.findUnique({ where: { id: body.targetShotListId } })
      if (job?.inputPayload) {
        shots = [(job.inputPayload as Record<string, unknown>)]
      }
    }

    const updatedShots = analyser.applyStyleDNAToShotList(shots, styleDNA)

    return NextResponse.json({ styleDNA, updatedShots })
  } catch (err) {
    console.warn("[caught] src/app/api/analysis/match-style/route.ts:48", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundOperationCredits(userId, 'reference_style_apply')
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Style matching failed' }, { status: 500 })
  }
}
