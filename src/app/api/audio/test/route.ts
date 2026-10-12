import { NextRequest, NextResponse } from 'next/server'
import { pingElevenLabs } from '@/lib/elevenlabs/client'
import { requireUser } from '@/lib/auth/requireUser'
import { allowRate } from '@/lib/http/rateLimit'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allowRate(`audio-test:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const key = req.headers.get('x-elevenlabs-key')
  if (!key) return NextResponse.json({ ok: false, reason: 'no key' }, { status: 401 })
  try {
    await pingElevenLabs(key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn("[caught] src/app/api/audio/test/route.ts:10", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ ok: false, reason: 'invalid key' }, { status: 401 })
  }
}
