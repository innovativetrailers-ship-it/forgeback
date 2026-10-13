import { type NextRequest, NextResponse } from 'next/server'
import { think, type CreativeBrief } from '@/lib/cognition'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import { RelayRefused } from '@/lib/billing/relayMeter'
import { meterDesktopRelay } from '@/lib/desktop/meterRelay'
import type { CharacterDirectorContext } from '@/lib/cognition/director'

export const maxDuration = 120

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await validateDesktopCloudRequest(request)
  if (userId instanceof NextResponse) return userId

  const body = (await request.json()) as {
    prompt?: string
    durationSec?: number
    characterContext?: CharacterDirectorContext | null
  }

  const prompt = body.prompt?.trim() ?? ''
  if (!prompt) {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  try {
    const brief: CreativeBrief = await meterDesktopRelay(userId, 'think', () => think({
      userId,
      prompt,
      durationSec: Number(body.durationSec ?? 10),
      characterContext: body.characterContext ?? null,
    }))
    return NextResponse.json(brief)
  } catch (e) {
    console.warn("[caught] src/app/api/desktop/cognition/think/route.ts:30", e instanceof Error ? { name: e.name, message: e.message } : e)
    if (e instanceof RelayRefused) {
      return NextResponse.json({ error: e.message }, { status: 402 })
    }

    const message = e instanceof Error ? e.message : 'Cognition failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
