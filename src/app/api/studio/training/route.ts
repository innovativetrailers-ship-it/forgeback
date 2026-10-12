import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { trainerDef, trainingCostUsd, recommendTrainer, assetTypeForTab, assetTypeFromTrainer, assertTrainingConsent, TrainingConsentError, domainFromSubcategory, importPrep, isImportDomain } from '@cinema/core'
import { db } from '@/lib/db'
import { isGenerationPaused } from '@/lib/generation/pause'
import { checkAndDeductCredits, OPERATION_COSTS } from '@/lib/credits'
import { trainingQueue, getPriorityForRole } from '@/lib/queue'
import { buildTrainingSet } from '@/lib/training/assemble'
import { startTraining } from '@/lib/training/start'
import { requireUser } from '@/lib/auth/requireUser'

const fileSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['image', 'video', 'audio']),
  caption: z.string().optional(),
  url: z.string().url().optional(),
  dataBase64: z.string().optional(),
})

const schema = z.object({
  trainerKey: z.string().optional(),
  tab: z.enum(['cast', 'styles', 'assets', 'music']).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  assetType: z.string().optional(),
  triggerPhrase: z.string().optional(),
  steps: z.number().int().min(100).max(8000).default(1000),
  confirmedCostUsd: z.number().positive(),
  isolateSubject: z.boolean().optional(),
  linkedCharacterId: z.string().optional(),
  subcategory: z.string().optional(),
  importDomain: z.string().optional(),
  ownedOrLicensed: z.boolean().optional(),
  subjectConsent: z.boolean().optional(),
  footageIncludesCopyrightedTitles: z.boolean().optional(),
  files: z.array(fileSchema).min(1),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isGenerationPaused()) {
    return NextResponse.json(
      { error: 'Generation is paused. Training is a paid FAL call.' },
      { status: 503 },
    )
  }

  const body = schema.parse(await req.json())
  if (body.tab === 'music' || body.trainerKey === 'stable-audio-3') {
    return NextResponse.json(
      { error: 'Music LoRA training is not offered. Scores are Suno and cannot apply a Stable Audio LoRA.' },
      { status: 400 },
    )
  }
  try {
    assertTrainingConsent({
      tab: body.tab,
      subcategory: body.subcategory,
      importDomain: body.importDomain,
      ownedOrLicensed: body.ownedOrLicensed,
      subjectConsent: body.subjectConsent,
      footageIncludesCopyrightedTitles: body.footageIncludesCopyrightedTitles,
    })
  } catch (err) {
    if (err instanceof TrainingConsentError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }
  const kinds = [...new Set(body.files.map((file) => file.kind))]
  let trainerKey = body.trainerKey
  if (!trainerKey && body.tab) {
    trainerKey = recommendTrainer({ tab: body.tab, subcategory: body.subcategory, kinds }).trainerKey
  }
  if (!trainerKey) return NextResponse.json({ error: 'trainerKey or tab is required' }, { status: 400 })
  const trainer = trainerDef(trainerKey)
  if (!trainer) return NextResponse.json({ error: 'Unknown trainer' }, { status: 400 })
  const assetType = body.assetType
    ?? (body.tab ? assetTypeForTab(body.tab) : assetTypeFromTrainer(trainer.trains))

  const importDomain = (body.importDomain && isImportDomain(body.importDomain)
    ? body.importDomain
    : null) ?? domainFromSubcategory(body.subcategory)
  const prep = importDomain ? importPrep({ domain: importDomain, kinds, tab: body.tab }) : null
  const captionGuidance = prep?.captionGuidance
  const expected = trainingCostUsd(trainer, body.steps)
  if (Math.abs(expected - body.confirmedCostUsd) > 0.01) {
    return NextResponse.json(
      { error: `Confirm $${expected} before training`, expectedCostUsd: expected },
      { status: 409 },
    )
  }

  const creditCost = OPERATION_COSTS.lora_training ?? 50
  await checkAndDeductCredits(userId, 'lora_training')

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  const renderJob = await db.renderJob.create({
    data: {
      userId,
      type: 'LORA_TRAIN',
      status: 'QUEUED',
      creditsCharged: creditCost,
      modelUsed: trainer.id,
      statusMessage: 'Assembling training set',
      inputPayload: {
        trainerKey,
        tab: body.tab,
        subcategory: body.subcategory,
        steps: body.steps,
        confirmedCostUsd: body.confirmedCostUsd,
      },
      priority: getPriorityForRole(user?.role ?? 'FREE'),
    },
  })

  const run = await db.trainingRun.create({
    data: {
      userId,
      jobId: renderJob.id,
      trainerKey,
      trainerId: trainer.id,
      trains: trainer.trains,
      assetType,
      name: body.name,
      description: body.description,
      triggerPhrase: body.triggerPhrase,
      steps: body.steps,
      costUsd: expected,
      status: 'assembling',
      isolateSubject: body.isolateSubject ?? false,
      loraInference: trainer.loraInference,
      linkedCharacterId: body.linkedCharacterId,
      subcategory: body.subcategory ?? '',
      importDomain: importDomain ?? undefined,
      ownedOrLicensed: body.ownedOrLicensed === true,
      subjectConsent: body.subjectConsent === true,
      captionGuidance: captionGuidance ?? undefined,
    },
  })

  try {
    const assembled = await buildTrainingSet({
      trainerKey,
      triggerPhrase: body.triggerPhrase,
      isolateSubject: body.isolateSubject,
      files: body.files.map((file) => ({
        name: file.name,
        kind: file.kind,
        caption: file.caption?.trim() || captionGuidance || undefined,
        url: file.url,
        bytes: file.dataBase64 ? Buffer.from(file.dataBase64, 'base64') : undefined,
      })),
    })

    const started = await startTraining({
      runId: run.id,
      userId,
      jobId: renderJob.id,
      trainerKey,
      dataUrl: assembled.dataUrl,
      triggerPhrase: body.triggerPhrase,
      steps: body.steps,
      confirmedCostUsd: body.confirmedCostUsd,
    })

    const jobData = { kind: 'lora' as const, jobId: renderJob.id, userId, runId: run.id }
    if (process.env.VERCEL) {
      const { after } = await import('next/server')
      const { processTrainingJobWithRefund } = await import('@/lib/jobs/processTrainingJob')
      after(() => processTrainingJobWithRefund(jobData))
    } else {
      await trainingQueue.add('train', jobData, {
        priority: getPriorityForRole(user?.role ?? 'FREE'),
        attempts: 1,
      })
    }

    return NextResponse.json({
      runId: run.id,
      jobId: renderJob.id,
      requestId: started.requestId,
      costUsd: started.costUsd,
      status: 'training',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Training failed to start'
    await db.trainingRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message, completedAt: new Date() },
    })
    await db.renderJob.update({
      where: { id: renderJob.id },
      data: { status: 'FAILED', errorMessage: message, statusMessage: message, completedAt: new Date() },
    })
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    await captureGenerationError({
      err,
      rawError: message,
      userId,
      jobId: renderJob.id,
      model: trainerKey,
      endpoint: trainer.id,
      stage: 'submit',
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const runs = await db.trainingRun.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ runs })
}
