import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { stabiliseVideo }            from '@/lib/timeline/stabilise'

type Strength = 'smooth' | 'locked' | 'cinematic'

const LABEL_MAP: Record<string, Strength> = {
  mild:   'smooth',
  medium: 'cinematic',
  strong: 'locked',
  smooth:     'smooth',
  locked:     'locked',
  cinematic:  'cinematic',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:   string
    strength?:  string
    cropRatio?: number
  }

  const { videoUrl, cropRatio } = body
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  const strength: Strength = LABEL_MAP[body.strength ?? 'medium'] ?? 'cinematic'

  await checkAndDeductCredits(userId, 'stabilise')

  try {
    const { stabilisedUrl } = await stabiliseVideo({ videoUrl, strength, cropRatio })
    return NextResponse.json({ stabilisedUrl })
  } catch (err) {
    await refundCredits(userId, 10, 'Stabilise failed')
    console.error('[timeline/stabilise]', err)
    return NextResponse.json({ error: 'Stabilisation failed' }, { status: 500 })
  }
}
