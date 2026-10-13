import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { harmoniseClips } from '@/lib/timeline/harmonise'
import { checkAndDeductCredits } from '@/lib/credits'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  clips: z.array(z.object({ url: z.string().url(), modelFamily: z.string() })),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'harmonise')
  } catch (err) {
    console.warn("[caught] src/app/api/timeline/harmonise/route.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const results = await harmoniseClips(parsed.data.clips)
  return NextResponse.json(results)
}
