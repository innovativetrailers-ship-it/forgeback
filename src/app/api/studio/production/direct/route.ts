import { compileProductionPlan } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { orchestrate } from '@/lib/orchestration'
import { loadEntityResolutions, loadProductionBreakdown } from '@/lib/studio/productionBoard'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  projectId: z.string().min(1),
  totalDuration: z.number().min(1).max(600).default(30),
  selectedModels: z.array(z.string()).default([]),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid direct request' }, { status: 400 })
  const breakdown = await loadProductionBreakdown(userId, parsed.data.projectId)
  if (!breakdown?.scenes.length) return NextResponse.json({ error: 'Import a plan first' }, { status: 400 })
  const entityResolutions = await loadEntityResolutions(userId, parsed.data.projectId, breakdown)
  const selectedModels = parsed.data.selectedModels.length
    ? parsed.data.selectedModels
    : ['gemini-omni', 'veo-3.1', 'kling-3.0', 'seedance-2.0', 'runway-gen4', 'grok-imagine-video', 'wan-2.7', 'ltx-2.3-fast']
  const compiledPlan = compileProductionPlan({ breakdown, entities: entityResolutions })
  try {
    const result = await orchestrate({
      direct: true,
      breakdown,
      entityResolutions,
      prompt: breakdown.scenes.map((scene) => scene.description || scene.location || scene.id).join('\n') || 'Direct',
      totalDuration: parsed.data.totalDuration,
      selectedModels,
      userId,
      projectId: parsed.data.projectId,
    })
    return NextResponse.json({ compiledPlan: result.compiledPlan ?? compiledPlan, paused: false })
  } catch (err) {
    if (!isGenerationPausedError(err)) {
      const message = err instanceof Error ? err.message : 'Direct failed'
      return NextResponse.json({ error: message, compiledPlan }, { status: 400 })
    }
    console.warn('[direct] generation is paused; the compiled plan is ready', err instanceof Error ? err.message : err)
    return NextResponse.json({
      paused: true,
      compiledPlan,
      message: 'Generation is paused. The film is planned and nothing was submitted.',
    })
  }
}
