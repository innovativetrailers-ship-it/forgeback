import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkContinuity } from '@/lib/studio/continuity'
import { checkAndDeductCredits } from '@/lib/credits'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  recipe: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'continuity_check')
  } catch (err) {
    console.warn("[caught] src/app/api/studio/continuity/route.ts:21", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const issues = await checkContinuity(parsed.data.recipe as unknown as TimelineRecipe)
  return NextResponse.json({ issues })
}
