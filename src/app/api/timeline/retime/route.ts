import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { opticalFlowRetime }         from '@/lib/timeline/retime'

const SPEED_TO_FPS: Record<string, number> = {
  '25':   12,   // 0.25x (slow-mo 4x) → 12fps input → 48fps interpolated
  '50':   24,   // 0.5x (slow-mo 2x)
  '100':  24,   // 1x (original)
  '200':  48,   // 2x (timelapse)
  '400':  96,   // 4x (fast timelapse)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:  string
    speed:     '25' | '50' | '100' | '200' | '400' | 'custom'
    targetFps?: number
    quality?:  'draft' | 'full'
    section?:  { start: number; end: number }
  }

  const { videoUrl, speed, quality = 'full', section } = body
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  const targetFps = body.targetFps ?? SPEED_TO_FPS[speed] ?? 24

  await checkAndDeductCredits(userId, 'optical_flow_retime')

  try {
    const { retimedUrl } = await opticalFlowRetime({ videoUrl, targetFps, section, quality })
    return NextResponse.json({ retimedUrl })
  } catch (err) {
    await refundCredits(userId, 20, 'Retime failed')
    console.error('[timeline/retime]', err)
    return NextResponse.json({ error: 'Retime failed' }, { status: 500 })
  }
}
