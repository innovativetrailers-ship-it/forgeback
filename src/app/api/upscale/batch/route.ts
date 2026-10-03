import { NextRequest, NextResponse } from 'next/server'
import { checkAndDeductCredits, refundCredits, OPERATION_COSTS } from '../../../../lib/credits'
import { renderQueue } from '../../../../lib/queue'
import type { UpscaleJob } from '../../../../lib/upscale/router'
import { engineCreditKey, routeUpscaleEngine } from '../../../../lib/upscale/router'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { projectId: string; clipIds: string[]; job: UpscaleJob }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/upscale/batch/route.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId, clipIds, job } = body
  if (!projectId || !clipIds?.length || !job) {
    return NextResponse.json({ error: 'projectId, clipIds, job required' }, { status: 400 })
  }

  const creditKey = engineCreditKey(routeUpscaleEngine(job), job.targetFactor, false)
  const costPerClip = OPERATION_COSTS[creditKey] ?? 3
  const totalCost = costPerClip * clipIds.length

  try {
    await checkAndDeductCredits(userId, creditKey, clipIds.length)
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/batch/route.ts:29", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  // Enqueue one BullMQ job per clip (lower priority — background batch task)
  const jobIds: string[] = []
  try {
    for (const clipId of clipIds) {
      const batchJob = await renderQueue.add(
        'upscale_batch',
        { userId, projectId, clipId, job, type: 'UPSCALE' },
        { priority: 1 }
      )
      jobIds.push(batchJob.id ?? clipId)
    }
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/batch/route.ts:44", e instanceof Error ? { name: e.name, message: e.message } : e)

    await refundCredits(userId, totalCost, 'Batch upscale queue failed')
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ jobIds, totalClips: clipIds.length, creditsCharged: totalCost })
}
