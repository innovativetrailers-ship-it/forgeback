import { NextRequest, NextResponse } from 'next/server'
import { pingElevenLabs } from '@/lib/elevenlabs/client'

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-elevenlabs-key') ?? process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ ok: false, reason: 'no key' }, { status: 401 })
  try {
    await pingElevenLabs(key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn("[caught] src/app/api/audio/test/route.ts:10", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ ok: false, reason: 'invalid key' }, { status: 401 })
  }
}
