import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertModelsResolvable } from '@/lib/models/resolveModel'
import { MODEL_COSTS } from '@/lib/routing/engineRegistry'
import { initializeFirstShotDirection } from '@/lib/studio/initializeFirstShot'
import { listShotPlan, parseScriptToShotPlan } from '@/lib/studio/shotPlan'

const schema = z.object({
  projectId: z.string(),
  script: z.string().min(10),
  selectedModels: z.array(z.string()).min(1),
  duration: z.number().int().min(5).max(600).optional(),
  qualityTier: z.enum(['Draft', 'Studio', 'Blockbuster', 'draft', 'standard', 'blockbuster']).optional(),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.parse(await req.json())
  const validIds = new Set(Object.keys(MODEL_COSTS))
  const selectedModels = body.selectedModels.filter((id) => validIds.has(id))
  if (!selectedModels.length) {
    return NextResponse.json({ error: 'No valid models in council selection' }, { status: 400 })
  }

  try {
    assertModelsResolvable(selectedModels)
  } catch (err) {
    console.warn("[caught] src/app/api/studio/parse/route.ts:30", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Invalid model in council selection'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const project = await db.project.findFirst({
    where: { id: body.projectId, userId },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { dag } = await parseScriptToShotPlan({
    projectId: body.projectId,
    userId,
    script: body.script,
    selectedModels,
    duration: body.duration,
    qualityTier: body.qualityTier,
  })

  try {
    assertModelsResolvable(dag.map((n) => n.assignedModel))
  } catch (err) {
    console.warn("[caught] src/app/api/studio/parse/route.ts:51", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Invalid model in shot plan'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  await initializeFirstShotDirection(body.projectId)
  const { shots, totalCost } = await listShotPlan(body.projectId)
  return NextResponse.json({ shots, totalCost })
}
