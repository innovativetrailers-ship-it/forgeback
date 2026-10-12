import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateClipProxy } from '@/lib/timeline/proxy'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  clipId: z.string(),
  sourceUrl: z.string().url(),
  prompt: z.string(),
  duration: z.number().min(0.5).max(300),
  aspectRatio: z.string().optional().default('16:9'),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const manifest = await generateClipProxy(parsed.data)
  return NextResponse.json(manifest)
}
