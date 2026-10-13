import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { overdubClip }               from '@/lib/audio/Overdub'
import { requireUser } from '@/lib/auth/requireUser'
import { recordConsent } from '@/lib/privacy/consent'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    audioUrl:    string
    replacement: string
    startSec:    number
    endSec:      number
    voiceId:     string
    modelId?:    string
    likenessConsent?: boolean
    notMinor?: boolean
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
  if (body.likenessConsent !== true || body.notMinor !== true) {
    return NextResponse.json({ error: 'Voice consent is required, and the speaker must not be a minor. Nothing was changed.' }, { status: 400 })
  }
  await recordConsent(userId, 'voice', 'audio.overdub')

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
