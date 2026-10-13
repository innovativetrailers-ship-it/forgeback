import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateFoley } from '@/lib/audio/audiocraft'
import { checkAndDeductCredits } from '@/lib/credits'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  description: z.string().min(3),
  durationSeconds: z.number().min(1).max(120).default(5),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'foley_generate')
  } catch (err) {
    console.warn("[caught] src/app/api/audio/foley/route.ts:21", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const result = await generateFoley(parsed.data)
  return NextResponse.json(result)
}
