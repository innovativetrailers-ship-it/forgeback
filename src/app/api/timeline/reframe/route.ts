import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { reframeClip }               from '@/lib/timeline/AutoReframe'

type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9' | '4:3' | '21:9'

// H04 platform presets
const PLATFORM_PRESETS: Record<string, AspectRatio> = {
  tiktok:       '9:16',
  instagram:    '1:1',
  instagram_reel: '9:16',
  youtube:      '16:9',
  linkedin:     '4:5',
  twitter:      '16:9',
  facebook:     '16:9',
  widescreen:   '21:9',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    clipUrl:           string
    targetAspectRatio?: AspectRatio
    platform?:         string
    subjectTracking?:  boolean
  }

  const { clipUrl, subjectTracking = true } = body
  if (!clipUrl) return NextResponse.json({ error: 'clipUrl required' }, { status: 400 })

  // Resolve aspect ratio — platform preset takes precedence
  const targetAspectRatio: AspectRatio =
    (body.platform ? PLATFORM_PRESETS[body.platform] : null) ??
    body.targetAspectRatio ??
    '9:16'

  await checkAndDeductCredits(userId, 'auto_reframe')

  try {
    const { reframedUrl } = await reframeClip({ clipUrl, targetAspectRatio, subjectTracking })
    return NextResponse.json({ reframedUrl, aspectRatio: targetAspectRatio })
  } catch (err) {
    await refundCredits(userId, 10, 'Auto reframe failed')
    console.error('[timeline/reframe]', err)
    return NextResponse.json({ error: 'Reframe failed' }, { status: 500 })
  }
}
