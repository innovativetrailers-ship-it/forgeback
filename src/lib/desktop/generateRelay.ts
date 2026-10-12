import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { openHold, releaseHold, settleHold } from '@/lib/credits/escrow'
import { RelayRefused, runMetered } from '@/lib/billing/relayMeter'
import { allowRate } from '@/lib/http/rateLimit'
import { resolveEntitlement } from '@/lib/entitlement/resolve'
import { assertEstimate, MAX_CONCURRENT_HOLDS, SUBMITS_PER_MINUTE, settleWithinHold, withinConcurrent } from '@/lib/billing/relayPolicy'
import { pauseReason, resolveRelayTarget } from '@/lib/desktop/relayTarget'
import { falWebhookUrl } from '@/lib/webhooks/falSignature'

export interface RelaySubmitResult {
  jobId: string
  estimate: number
}

function metaOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function submitGenerateRelay(
  userId: string,
  endpointKey: string,
  input: Record<string, unknown>,
  source: string,
): Promise<RelaySubmitResult> {
  const paused = pauseReason()
  if (paused) throw new RelayRefused(paused)
  const target = resolveRelayTarget(endpointKey)
  assertEstimate(target.estimate)
  if (!allowRate(`relay-submit:${userId}`, SUBMITS_PER_MINUTE, 60_000)) {
    throw new RelayRefused('Too many requests. Wait a moment.')
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, creditBalance: true, isInternal: true },
  })
  if (!user) throw new RelayRefused('Account not found.')
  const entitlement = await resolveEntitlement(userId)
  if (!entitlement.canUseDesktop && !entitlement.canUseWeb) {
    throw new RelayRefused('This account cannot use hosted generation.')
  }
  const active = await db.creditHold.count({ where: { userId, status: 'ACTIVE' } })
  if (!withinConcurrent(active) && !user.isInternal) {
    throw new RelayRefused('Too many jobs are already running.')
  }
  const job = await db.renderJob.create({
    data: {
      userId,
      status: 'QUEUED',
      modelUsed: target.key,
      inputPayload: input as Prisma.InputJsonValue,
      metadata: {
        relay: true,
        endpointKey: target.key,
        endpoint: target.endpoint,
        category: target.category,
        estimate: target.estimate,
        source,
      },
    },
  })
  try {
    await runMetered({
      balance: user.creditBalance,
      isInternal: user.isInternal,
      estimate: target.estimate,
      openHold: async () => { await openHold(userId, job.id, target.estimate) },
      settle: async () => {},
      release: async () => { await releaseHold(job.id) },
      run: async () => {
        const { renderQueue } = await import('@/lib/queue')
        await renderQueue.add('relay-generate', {
          jobId: job.id,
          userId,
          modelId: target.key,
          type: 'GENERATE',
        }, { attempts: 1, jobId: `relay:${job.id}` })
      },
    })
  } catch (err) {
    await db.renderJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Could not start the job.',
        completedAt: new Date(),
      },
    })
    throw err
  }
  return { jobId: job.id, estimate: target.estimate }
}

export async function relayJobForUser(userId: string, jobId: string) {
  const job = await db.renderJob.findFirst({ where: { id: jobId, userId } })
  if (!job) throw new RelayRefused('Job not found.')
  return job
}

export async function cancelGenerateRelay(userId: string, jobId: string): Promise<void> {
  const job = await relayJobForUser(userId, jobId)
  if (job.status === 'COMPLETE' || job.status === 'FAILED' || job.status === 'CANCELLED') return
  await db.renderJob.update({
    where: { id: job.id },
    data: { status: 'CANCELLED', errorMessage: 'Cancelled.', completedAt: new Date() },
  })
  await releaseHold(job.id)
}

/** Worker entry. Submits with the platform credential and a signed webhook. */
export async function dispatchRelayJob(jobId: string): Promise<void> {
  const paused = pauseReason()
  const job = await db.renderJob.findUnique({ where: { id: jobId } })
  if (!job || job.status === 'CANCELLED') return
  if (paused) {
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: paused, completedAt: new Date() },
    })
    await releaseHold(jobId)
    return
  }
  const meta = metaOf(job.metadata)
  const endpoint = typeof meta.endpoint === 'string' ? meta.endpoint : ''
  const category = typeof meta.category === 'string' ? meta.category : ''
  const input = (job.inputPayload && typeof job.inputPayload === 'object' ? job.inputPayload : {}) as Record<string, unknown>
  await db.renderJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } })
  if (category === 'llm') {
    const { postAnthropicMessages, anthropicMessageText } = await import('@cinema/core')
    const messages = Array.isArray(input.messages) ? input.messages : [{ role: 'user', content: String(input.prompt ?? '') }]
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    if (!model) throw new Error('Choose a language model.')
    const result = await postAnthropicMessages({
      model,
      maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 1024,
      system: typeof input.system === 'string' ? input.system : undefined,
      messages,
      source: 'relay.llm',
    })
    const text = anthropicMessageText(result)
    await finishRelayJob(jobId, true, undefined, undefined, { text })
    return
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const webhookUrl = falWebhookUrl(`${appUrl}/api/webhooks/fal`, jobId)
  const { submitToFal } = await import('@/lib/fal/falQueue')
  const submission = await submitToFal(endpoint, input, 'relay.generate', jobId, { webhookUrl })
  await db.renderJob.update({
    where: { id: jobId },
    data: { metadata: { ...meta, falRequestId: submission.requestId } as Prisma.InputJsonValue },
  })
}

export async function finishRelayJob(
  jobId: string,
  ok: boolean,
  outputUrl?: string,
  error?: string,
  extra?: Record<string, unknown>,
): Promise<'noop' | 'settled' | 'stored'> {
  const job = await db.renderJob.findUnique({ where: { id: jobId } })
  if (!job) return 'noop'
  if (job.status === 'COMPLETE' || job.status === 'FAILED' || job.status === 'CANCELLED') return 'noop'
  const meta = metaOf(job.metadata)
  const hold = await db.creditHold.findUnique({ where: { jobId } })
  if (!ok) {
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: error ?? 'The provider failed.', completedAt: new Date() },
    })
    await releaseHold(jobId)
    return 'settled'
  }
  if (!hold || hold.status !== 'ACTIVE') {
    await db.renderJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETE',
        outputUrl,
        progressPct: 100,
        completedAt: new Date(),
        metadata: { ...meta, late: true, ...extra } as Prisma.InputJsonValue,
      },
    })
    return 'stored'
  }
  const estimate = typeof meta.estimate === 'number' ? meta.estimate : hold.amountHeld
  const decision = settleWithinHold(hold.amountHeld, estimate)
  if (decision.exceeded) {
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', errorMessage: 'The job cost more than the hold.', completedAt: new Date() },
    })
    await releaseHold(jobId)
    return 'settled'
  }
  await db.creditHold.update({ where: { jobId }, data: { amountUsed: decision.charge } })
  await settleHold(jobId)
  await db.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETE',
      outputUrl,
      creditsCharged: decision.charge,
      progressPct: 100,
      completedAt: new Date(),
      metadata: { ...meta, ...extra } as Prisma.InputJsonValue,
    },
  })
  return 'settled'
}

export { MAX_CONCURRENT_HOLDS }
