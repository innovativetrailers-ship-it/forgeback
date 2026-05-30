/**
 * POST /api/export/spatial — Apple Vision Pro spatial video (.mvhevc)
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { encodeSpatialVideo }        from '@/lib/spatial/SpatialExport'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    leftEyeUrl:   string
    rightEyeUrl:  string
    fov?:         number
    baselineM?:   number
    disparity?:   number
  }

  if (!body.leftEyeUrl || !body.rightEyeUrl) {
    return NextResponse.json({ error: 'leftEyeUrl and rightEyeUrl required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'spatial_export')

  try {
    const result = await encodeSpatialVideo(body)
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 20, 'Spatial export failed')
    console.error('[export/spatial]', err)
    return NextResponse.json({ error: 'Spatial video encoding failed' }, { status: 500 })
  }
}
