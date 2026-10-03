import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { trackPlanarRegion } from '@/lib/timeline/tracker'
import type { PlanarFrame } from '@/lib/timeline/controlLayer'

const schema = z.object({
  videoUrl: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  imageUrl: z.string().min(1),
})

/** Track a plane and return the insert that follows it. The clip itself is unchanged. */
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid track' }, { status: 400 })

  const tracked = await trackPlanarRegion({
    videoUrl: parsed.data.videoUrl,
    regionOfInterest: {
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width,
      height: parsed.data.height,
    },
    trackingMethod: 'perspective',
  })
  const frames: PlanarFrame[] = tracked.trackData.map((frame) => {
    const xs = frame.corners.map((corner) => corner.x)
    const ys = frame.corners.map((corner) => corner.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      timeSec: frame.frame / 30,
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    }
  })
  return NextResponse.json({
    planarInsert: { imageUrl: parsed.data.imageUrl, frames },
    note: 'Point tracking is not on the gateway. The insert stays on the region you marked.',
  })
}
