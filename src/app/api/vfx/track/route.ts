import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { trackPlanarSurface }        from '@/lib/vfx/PlanarTracker'
import type { Quad }                 from '@/lib/vfx/PlanarTracker'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:    string
    initialQuad: Quad
    fps?:        number
  }

  if (!body.videoUrl || !body.initialQuad) {
    return NextResponse.json({ error: 'videoUrl and initialQuad required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'planar_track')

  try {
    const result = await trackPlanarSurface(body)
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 15, 'Planar tracking failed')
    console.error('[vfx/track]', err)
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 })
  }
}
