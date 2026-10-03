import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { synthesiseSpeech } from '@/lib/audio/elevenlabs'
import { checkAndDeductCredits } from '@/lib/credits'

const schema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string(),
  emotion: z.enum(['neutral', 'excited', 'sad', 'angry', 'whispering']).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'speech_generate')
  } catch (err) {
    console.warn("[caught] src/app/api/audio/speech/route.ts:24", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const result = await synthesiseSpeech(parsed.data)
  return NextResponse.json(result)
}
