import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { removeFillersAndSilence }   from '@/lib/audio/FillerRemover'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    audioUrl:          string
    fillerWords?:      string[]
    sensitivity?:      'aggressive' | 'moderate' | 'gentle'
    previewOnly?:      boolean
    projectId?:        string
  }

  const { audioUrl, previewOnly = true } = body
  if (!audioUrl) return NextResponse.json({ error: 'audioUrl required' }, { status: 400 })

  // Only charge credits if actually applying (not preview)
  if (!previewOnly) {
    await checkAndDeductCredits(userId, 'filler_removal')
  }

  try {
    const result = await removeFillersAndSilence({
      ...body,
      projectId: body.projectId ?? userId,
      audioUrl,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (!previewOnly) await refundCredits(userId, 5, 'Filler removal failed')
    console.error('[audio/remove-fillers]', err)
    return NextResponse.json({ error: 'Filler removal failed' }, { status: 500 })
  }
}
