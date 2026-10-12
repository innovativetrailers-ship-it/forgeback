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
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const body = await request.json().catch((err) => {
    console.warn('[fal-webhook] body', err instanceof Error ? err.message : err)
    return null
  }) as FalWebhookPayload | null
  if (!body?.request_id) {
    return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })
  }
  const { verifyFalWebhookToken, isFalMediaUrl } = await import('@/lib/webhooks/falSignature')
  const subjectId = verifyFalWebhookToken(token)
  if (!subjectId) {
    return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 })
  }
  const requestId = body.request_id
  const status = body.status
  const payload = body.payload
  const error = body.error

  const trainingRun = await db.trainingRun.findFirst({
    where: { id: subjectId },
    select: { id: true, falRequestId: true },
  })
  if (trainingRun) {
    if (trainingRun.falRequestId && trainingRun.falRequestId !== requestId) {
      return NextResponse.json({ error: 'Webhook does not match this run' }, { status: 401 })
    }
    if (trainingRun.falRequestId) {
      const { onTrainingComplete } = await import('@/lib/training/complete')
      const trainingPayload = (payload ?? body) as Record<string, unknown>
      await onTrainingComplete({
        falRequestId: trainingRun.falRequestId,
        data: status === 'OK' ? trainingPayload : undefined,
        error: status === 'ERROR' ? (error ?? payload?.error ?? 'Training failed') : undefined,
      })
      if (payload?.diffusers_lora_file && isFalMediaUrl(payload.diffusers_lora_file.url)) {
        const character = await db.vaultCharacter.findFirst({
          where: { loraModelId: trainingRun.falRequestId },
        })
        if (character) {
          await db.vaultCharacter.update({
            where: { id: character.id },
            data: {
              loraStatus: status === 'OK' ? 'READY' : 'FAILED',
              loraModelId: payload.diffusers_lora_file.url,
            },
          })
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  // Find the job linked to this fal request
  const renderJob = await db.renderJob.findFirst({
    where: { id: subjectId },
  })

  if (!renderJob) {
    return NextResponse.json({ received: true })
  }

  if (status === 'OK') {
    const outputUrl =
      [payload?.video?.url, payload?.images?.[0]?.url].find((item) => isFalMediaUrl(item))

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
