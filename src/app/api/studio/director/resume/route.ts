import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearStage, parseWizard, WIZARD_STAGES, type WizardStage } from '@/lib/orchestration/wizardState'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[wizard] resume body', err instanceof Error ? err.message : err)
    return null
  }) as { jobId?: string; auto?: boolean } | null
  const jobId = body?.jobId?.trim()
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const job = await db.renderJob.findFirst({ where: { id: jobId, userId } })
  if (!job) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const meta = (job.metadata && typeof job.metadata === 'object' ? job.metadata : {}) as Record<string, unknown>
  const wizard = parseWizard(meta.wizard)
  if (!wizard) return NextResponse.json({ error: 'This run has no wizard state' }, { status: 400 })
  const stage = (job.phase ?? '').replace('awaiting_user:', '') as WizardStage
  const next = body?.auto
    ? { ...wizard, mode: 'auto' as const, cleared: [...WIZARD_STAGES] }
    : stage === 'script' || stage === 'references' || stage === 'keyframes' || stage === 'shots'
      ? clearStage(wizard, stage)
      : wizard
  const selectedModels = Array.isArray(meta.selectedModels) ? meta.selectedModels.filter((id): id is string => typeof id === 'string') : []
  if (!selectedModels.length) return NextResponse.json({ error: 'Council selection missing on this run' }, { status: 400 })

  await db.renderJob.update({
    where: { id: job.id },
    data: {
      status: 'QUEUED',
      phase: 'resuming',
      statusMessage: `Resuming after ${stage || 'the gate'}`,
      metadata: { ...meta, wizard: JSON.parse(JSON.stringify(next)) },
    },
  })

  const { renderQueue } = await import('@/lib/queue')
  await renderQueue.add('orchestrate', {
    jobId: job.id,
    userId,
    prompt: job.prompt,
    duration: job.duration,
    selectedModels,
    projectId: job.projectId,
    generationMode: meta.generationMode,
    qualityTier: meta.qualityTier,
    creativeLicense: meta.creativeLicense,
    source: 'director',
  }, { attempts: 1, removeOnComplete: 200, removeOnFail: 500 })

  return NextResponse.json({ jobId: job.id, cleared: next.cleared, estimateCredits: next.spendCredits })
}
