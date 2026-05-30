import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { extendClip }                from '@/lib/timeline/ClipExtend'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    clipUrl:           string
    direction?:        'start' | 'end' | 'both'
    extensionSeconds?: number
    tier?:             'draft' | 'standard' | 'premium' | 'cinematic' | 'film'
    prompt?:           string
    modelUsed?:        string
    characterIds?:     string[]
  }

  const { clipUrl, prompt = '', modelUsed = 'auto', characterIds = [] } = body
  if (!clipUrl) return NextResponse.json({ error: 'clipUrl required' }, { status: 400 })

  const direction        = body.direction        ?? 'end'
  const extensionSeconds = body.extensionSeconds ?? 4
  const tier             = body.tier             ?? 'standard'

  await checkAndDeductCredits(userId, 'clip_extend')

  try {
    const { extendedClipUrl } = await extendClip({
      clipUrl,
      clipMetadata: { prompt, modelUsed, characterIds },
      direction,
      extensionSeconds,
      tier,
    })
    return NextResponse.json({ extendedClipUrl })
  } catch (err) {
    await refundCredits(userId, 8, 'Clip extend failed')
    console.error('[timeline/extend]', err)
    return NextResponse.json({ error: 'Clip extend failed' }, { status: 500 })
  }
}
