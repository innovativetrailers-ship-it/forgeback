/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODEL_COSTS, TIER_ENGINE_MAP } from './routing/engineRegistry'

export class CreditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreditError'
  }
}

export function calculateGenerationCost(model: string, durationSeconds: number): number {
  const ratePerFiveSeconds = MODEL_COSTS[model]
  if (!ratePerFiveSeconds) {
    console.warn(`[credits] Unknown model "${model}", defaulting to ltx-2.3-fast`)
    return Math.ceil((MODEL_COSTS['ltx-2.3-fast'] / 5) * durationSeconds)
  }
  return Math.ceil((ratePerFiveSeconds / 5) * durationSeconds)
}

export function calculateSimpleCost(tier: string, durationSeconds: number): number {
  const engine = TIER_ENGINE_MAP[tier] ?? 'ltx-2.3-fast'
  return calculateGenerationCost(engine, durationSeconds)
}

export function calculateOrchestrationCost(
  segments: Array<{ assignedModel: string; duration: number }>
): number {
  return Math.ceil(
    segments.reduce((sum, seg) => sum + calculateGenerationCost(seg.assignedModel, seg.duration), 0)
  )
}

export const OPERATION_COSTS: Record<string, number> = {
  'grok-imagine-video':            20,  // $0.05/s xAI API → 20cr/5s
  'nano-banana-2':                  2,
  'nano-banana-pro':                5,
  'flux-pro':                       4,
  'elevenlabs_tts_per_100_chars':   1,
  'elevenlabs_clone_voice':        20,
  'elevenlabs_overdub':             2,
  'elevenlabs_sts_per_30s':         3,
  'elevenlabs_sfx_per_5s':          1,
  'suno_music_per_30s':             5,
  'mapillary_search':               0,
  'cesium_aerial_path':             0,
  'pexels_stock':                   0,
  'llm_claude_sonnet':              3,
  'llm_claude_haiku':               1,
  'llm_groq':                       1,
  'llm_xai':                        2,
  'llm_kimi':                       1,
  'audiocraft_ambient_per_30s':     2,
  'optical_flow_retime_per_min':    4,
  'morph_cut':                      3,
  'video_stabilise_per_min':        2,
  'clip_extend_2s':                10,
  'clip_extend_4s':                18,
  'clip_extend_8s':                32,
  'filler_word_removal':            1,
  'silence_removal':                0,
  'speaker_separation_per_min':     5,
  'video_translation_per_min':      8,
  'object_removal_per_clip':       20,
  'planar_track_per_min':           3,
  'particle_bake_per_second':       1,
  'export_dcp':                    40,
  'export_imf':                    30,
  'export_stems':                   5,
  'c2pa_injection':                 0,
  'rough_cut_per_clip':             1,
  'emotion_analysis_per_project':   5,
  'mogrt_apply_template':           2,
  'mogrt_ai_generate':             15,
  'storyboard_per_scene':           3,
  'slides_to_video_per_slide':      2,
  'brand_kit_apply':                0,
}

export async function deductCredits(
  db:          any,
  userId:      string,
  credits:     number,
  description: string,
  vendor?:     string,
  vendorCostUSD?: number,
): Promise<void> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  if (user?.role === 'ADMIN') return

  if ((user?.creditBalance ?? 0) < credits) {
    throw new Error(`Insufficient credits: need ${credits}, have ${user?.creditBalance ?? 0}`)
  }

  const newBalance = user!.creditBalance - credits

  await db.$transaction(async (tx: any) => {
    await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: credits } } })
    await tx.creditTransaction.create({
      data: { userId, amount: -credits, description, balanceAfter: newBalance },
    })
    if (vendor && vendorCostUSD !== undefined) {
      await tx.vendorUsageLog?.create({
        data: { userId, vendor, operation: description, costUSD: vendorCostUSD, creditCost: credits },
      })
    }
  })

  // Best-effort Stripe balance sync
  try {
    const stripeCustomer = await db.stripeCustomer?.findUnique({ where: { userId } })
    if (stripeCustomer?.stripeCustomerId) {
      const { stripe, creditsToUSDCents } = await import('./payments/stripe')
      const debitCents = creditsToUSDCents(credits)
      await stripe.customers.createBalanceTransaction(
        stripeCustomer.stripeCustomerId,
        { amount: debitCents, currency: 'usd', description: `Usage: ${description}` }
      )
      await db.stripeCustomer.update({
        where: { userId },
        data:  { stripeBalanceCents: { decrement: debitCents } },
      })
    }
  } catch (err: unknown) {
    console.error('[credits] Stripe balance sync failed:', err instanceof Error ? err.message : err)
  }
}

export async function refundCredits(
  dbOrUserId: any,
  userIdOrAmount: string | number,
  amountOrReason?: number | string,
  reason?: string
): Promise<void> {
  if (typeof dbOrUserId === 'string') {
    // Legacy: refundCredits(userId, amount, reason)
    const { db } = await import('./db')
    const userId = dbOrUserId
    const amount = userIdOrAmount as number
    const rsn    = amountOrReason as string ?? ''
    await db.user.update({ where: { id: userId }, data: { creditBalance: { increment: amount } } })
    await db.creditTransaction.create({ data: { userId, amount, description: `Refund: ${rsn}`, balanceAfter: 0 } })
    return
  }
  const db     = dbOrUserId
  const userId = userIdOrAmount as string
  const amount = amountOrReason as number
  const rsn    = reason ?? ''
  await db.user.update({ where: { id: userId }, data: { creditBalance: { increment: amount } } })
  await db.creditTransaction.create({ data: { userId, amount, description: `Refund: ${rsn}`, balanceAfter: 0 } })
}

// Overloaded: new API (db, userId, amount, description) OR legacy (userId, operationKey)
export async function checkAndDeductCredits(
  dbOrUserId:          any,
  userIdOrOperationKey: string,
  credits?:            number,
  description?:        string
): Promise<void> {
  if (typeof dbOrUserId === 'string') {
    // Legacy call: checkAndDeductCredits(userId, operationKey)
    const { db } = await import('./db')
    const userId       = dbOrUserId
    const operationKey = userIdOrOperationKey
    const cost         = OPERATION_COSTS[operationKey] ?? 0
    if (cost === 0) return
    return deductCredits(db, userId, cost, operationKey)
  }
  // New call: checkAndDeductCredits(db, userId, amount, description)
  return deductCredits(dbOrUserId, userIdOrOperationKey, credits ?? 0, description ?? '')
}

// ── Backward-compatible shims ──────────────────────────────────────────────────

export async function refundOperationCredits(
  dbOrUserId: any,
  userIdOrKey: string,
  creditKeyOrUndefined?: string
): Promise<void> {
  if (typeof dbOrUserId === 'string') {
    // Legacy: refundOperationCredits(userId, creditKey)
    const { db } = await import('./db')
    const cost = OPERATION_COSTS[userIdOrKey] ?? 0
    if (cost > 0) await refundCredits(db, dbOrUserId, cost, userIdOrKey)
    return
  }
  const creditKey = creditKeyOrUndefined ?? userIdOrKey
  const cost = OPERATION_COSTS[creditKey] ?? 0
  if (cost > 0) await refundCredits(dbOrUserId, userIdOrKey, cost, creditKey)
}

export async function addCredits(
  dbOrUserId:  any,
  userIdOrAmount: string | number,
  amountOrDesc?: number | string,
  description?: string
): Promise<void> {
  if (typeof dbOrUserId === 'string') {
    // Legacy: addCredits(userId, amount, description)
    const { db } = await import('./db')
    const userId = dbOrUserId
    const amount = userIdOrAmount as number
    const desc   = amountOrDesc as string ?? ''
    await db.user.update({ where: { id: userId }, data: { creditBalance: { increment: amount } } })
    await db.creditTransaction.create({ data: { userId, amount, description: desc, balanceAfter: 0 } })
    return
  }
  const db     = dbOrUserId
  const userId = userIdOrAmount as string
  const amount = amountOrDesc as number
  const desc   = description ?? ''
  await db.user.update({ where: { id: userId }, data: { creditBalance: { increment: amount } } })
  await db.creditTransaction.create({ data: { userId, amount, description: desc, balanceAfter: 0 } })
}

export const TIER_MONTHLY_CREDITS: Record<string, number> = {
  FREE:    50,
  PRO:     1000,
  STUDIO:  5000,
  ADMIN:   999999,
}

export async function handleSubscriptionRenewal(
  db:     any,
  userId: string,
  planId: string
): Promise<void> {
  const role    = planId.toUpperCase()
  const credits = TIER_MONTHLY_CREDITS[role] ?? 50
  await addCredits(db, userId, credits, `Subscription renewal: ${planId}`)
}
