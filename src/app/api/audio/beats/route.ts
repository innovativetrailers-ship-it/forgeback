import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { detectBeats } from '@/lib/audio/beats'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  audioUrl: z.string().url(),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await detectBeats(parsed.data.audioUrl)
  return NextResponse.json(result)
}
