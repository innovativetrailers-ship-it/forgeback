import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkNSFW } from '@/lib/moderation/nsfw'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'video']).default('image'),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await checkNSFW(parsed.data.url, parsed.data.type)
  return NextResponse.json(result)
}
