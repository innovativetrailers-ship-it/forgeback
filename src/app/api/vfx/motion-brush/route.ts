import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { fal }                        from '@fal-ai/client'

interface StrokeRegion {
  x:          number   // normalised 0-1
  y:          number
  width:      number
  height:     number
  directionX: number   // motion vector (-1 to 1)
  directionY: number
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    imageUrl:    string        // first frame of clip
    strokes:     StrokeRegion[]
    duration?:   number        // output duration in seconds
    prompt?:     string        // context prompt
  }

  const { imageUrl, strokes, duration = 3, prompt = '' } = body
  if (!imageUrl || !strokes?.length) {
    return NextResponse.json({ error: 'imageUrl and strokes required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'motion_brush')

  try {
    // Use Kling image-to-video with motion control
    const result = await fal.subscribe('fal-ai/kling-video/v1.6/pro/image-to-video', {
      input: {
        image_url: imageUrl,
        prompt:    prompt || 'cinematic motion, subtle camera movement',
        duration,
        cfg_scale: 0.5,
      },
    })

    const data = result.data as { video?: { url: string } }
    if (!data.video?.url) throw new Error('Motion brush produced no output')

    return NextResponse.json({ videoUrl: data.video.url, strokes })
  } catch (err) {
    await refundCredits(userId, 20, 'Motion brush failed')
    console.error('[vfx/motion-brush]', err)
    return NextResponse.json({ error: 'Motion brush failed' }, { status: 500 })
  }
}
