import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcastJobEvent } from '@/lib/queue/events'

interface FalWebhookPayload {
  request_id: string
  status: 'OK' | 'ERROR'
  payload?: {
    diffusers_lora_file?: { url: string }
    lora_file?: { url: string }
    config_file?: { url: string }
    video?: { url: string }
    images?: Array<{ url: string }>
    error?: string
  }
  error?: string
}

export async function POST(request: NextRequest) {
  const body = await request.json() as FalWebhookPayload

  const { request_id: requestId, status, payload, error } = body

  if (!requestId) {
    return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })
  }

  const { onTrainingComplete } = await import('@/lib/training/complete')
  const trainingRun = await db.trainingRun.findFirst({
    where: { falRequestId: requestId },
    select: { id: true },
  })
  const trainingPayload = (payload ?? body) as Record<string, unknown>
  await onTrainingComplete({
    falRequestId: requestId,
    data: status === 'OK' ? trainingPayload : undefined,
    error: status === 'ERROR' ? (error ?? payload?.error ?? 'Training failed') : undefined,
  })
  if (trainingRun) {
    return NextResponse.json({ received: true })
  }

  // Find the job linked to this fal request
  const renderJob = await db.renderJob.findFirst({
    where: {
      inputPayload: {
        path: ['falRequestId'],
        equals: requestId,
      },
    },
  })

  if (!renderJob) {
    // Could be a LoRA training webhook — update character status
    const character = await db.vaultCharacter.findFirst({
      where: {
        loraModelId: requestId,
      },
    })

    if (character && payload?.diffusers_lora_file) {
      await db.vaultCharacter.update({
        where: { id: character.id },
        data: {
          loraStatus: status === 'OK' ? 'READY' : 'FAILED',
          loraModelId: payload.diffusers_lora_file.url,
        },
      })
    }

    return NextResponse.json({ received: true })
  }

  if (status === 'OK') {
    const outputUrl =
      payload?.video?.url ?? payload?.images?.[0]?.url ?? undefined

    await db.renderJob.update({
      where: { id: renderJob.id },
      data: {
        status: 'COMPLETE',
        outputUrl,
        progressPct: 100,
        completedAt: new Date(),
      },
    })

    await broadcastJobEvent({
      jobId: renderJob.id,
      status: 'complete',
      progress: 100,
      outputUrl,
    })
  } else {
    const errorMsg = error ?? payload?.error ?? 'fal.ai processing failed'

    await db.renderJob.update({
      where: { id: renderJob.id },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
        completedAt: new Date(),
      },
    })

    await broadcastJobEvent({
      jobId: renderJob.id,
      status: 'failed',
      error: errorMsg,
    })
  }

  return NextResponse.json({ received: true })
}
