import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { removeSilence }             from '@/lib/audio/SilenceRemover'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    audioUrl:         string
    minDurationSec?:  number    // minimum silence length (default 0.5s)
    thresholdDb?:     number    // dB threshold (default -40)
    previewOnly?:     boolean
  }

  const { audioUrl, previewOnly = true } = body
  if (!audioUrl) return NextResponse.json({ error: 'audioUrl required' }, { status: 400 })

  if (!previewOnly) {
    await checkAndDeductCredits(userId, 'silence_removal')
  }

  try {
    const result = await removeSilence({ ...body, audioUrl })
    return NextResponse.json(result)
  } catch (err) {
    if (!previewOnly) await refundCredits(userId, 5, 'Silence removal failed')
    console.error('[audio/remove-silence]', err)
    return NextResponse.json({ error: 'Silence removal failed' }, { status: 500 })
  }
}
