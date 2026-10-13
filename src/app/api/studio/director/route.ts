import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAIDirector } from '@/lib/studio/director'
import { checkAndDeductCredits } from '@/lib/credits'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  brief: z.string().min(10).max(2000),
  style: z.string().default('cinematic drama'),
  targetDuration: z.number().min(10).max(600).default(60),
  projectId: z.string(),
  autoQueue: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { brief, style, targetDuration, projectId, autoQueue } = parsed.data

  // Verify project ownership
  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  try {
    await checkAndDeductCredits(userId, 'ai_director')
  } catch (err) {
    console.warn("[caught] src/app/api/studio/director/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  // Fetch available vault assets
  const [characters, locations] = await Promise.all([
    db.vaultCharacter.findMany({ where: { projectId } }),
    db.asset.findMany({
      where: { kind: 'location', boundary: { path: ['projectId'], equals: projectId } },
      select: { id: true, label: true },
    }),
  ])

  const { recipe, directorNotes } = await runAIDirector({
    brief,
    style,
    targetDuration,
    projectId,
    userId,
    availableCharacters: characters.map((c) => ({ id: c.id, name: c.name })),
    availableLocations: locations.map((l) => ({ id: l.id, name: l.label ?? 'Location' })),
  })

  return NextResponse.json({ recipe, directorNotes, queued: false, autoQueue })
}
