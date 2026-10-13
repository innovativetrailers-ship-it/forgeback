import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth'
import { checkAndDeductCredits, refundCredits, OPERATION_COSTS } from '../../../../lib/credits'
import { upscaleClip } from '../../../../lib/upscale/clip'
import { routeUpscaleEngine, engineCreditKey } from '../../../../lib/upscale/router'
import type { UpscaleJob } from '../../../../lib/upscale/router'
import { db } from '../../../../lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { videoUrl: string; job: UpscaleJob; clipId?: string }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/upscale/clip/route.ts:16", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { videoUrl, job, clipId } = body
  if (!videoUrl || !job) {
    return NextResponse.json({ error: 'videoUrl and job are required' }, { status: 400 })
  }

  const creditKey = engineCreditKey(routeUpscaleEngine(job), job.targetFactor, false)
  if (!(creditKey in OPERATION_COSTS)) {
    return NextResponse.json({ error: 'Unknown upscale operation' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, creditKey)
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/clip/route.ts:32", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const { upscaledUrl, resolutionOut } = await upscaleClip({ videoUrl, job })

    return NextResponse.json({ upscaledUrl, resolutionOut, clipId })
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/clip/route.ts:40", e instanceof Error ? { name: e.name, message: e.message } : e)

    await refundCredits(userId, OPERATION_COSTS[creditKey] ?? 0, 'Upscale clip failed')
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
