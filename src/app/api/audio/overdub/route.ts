import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { overdubClip }               from '@/lib/audio/Overdub'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    audioUrl:    string
    replacement: string
    startSec:    number
    endSec:      number
    voiceId:     string
    modelId?:    string
  }

  const { audioUrl, replacement, startSec, endSec, voiceId } = body
  if (!audioUrl || !replacement || startSec == null || endSec == null || !voiceId) {
    return NextResponse.json(
      { error: 'audioUrl, replacement, startSec, endSec, voiceId are required' },
      { status: 400 },
    )
  }

  if (endSec <= startSec) {
    return NextResponse.json({ error: 'endSec must be greater than startSec' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'overdub')

  try {
    const result = await overdubClip(body)
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 5, 'Overdub failed')
    console.error('[audio/overdub]', err)
    return NextResponse.json({ error: 'Overdub failed' }, { status: 500 })
  }
}
