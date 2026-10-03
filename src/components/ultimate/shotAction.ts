import type { ShotPlanCard } from '@/lib/studio/shotPlan'
import { toast } from '@/lib/toast'
import { useUIStore } from '@/store/ui'

export interface ShotActionJson {
  error?: string
  code?: string
  required?: number
  balance?: number
  currentStatus?: string
  jobId?: string
}

export function cardStatusFromDb(raw: string): ShotPlanCard['status'] {
  switch (raw) {
    case 'AWAITING_DIRECTION':
    case 'awaiting_direction':
      return 'awaiting_direction'
    case 'GENERATING':
    case 'generating':
      return 'generating'
    case 'COMPLETED':
    case 'completed':
      return 'completed'
    case 'FAILED':
    case 'failed':
      return 'failed'
    case 'MANUAL':
    case 'manual':
      return 'manual'
    default:
      return 'pending'
  }
}

export function planShotFailure(
  status: number,
  data: ShotActionJson,
  failLabel: string,
): { message: string; openCredits: boolean; cardStatus: ShotPlanCard['status'] | null } {
  const cardStatus = data.currentStatus ? cardStatusFromDb(data.currentStatus) : null
  if (status === 402 && data.code === 'insufficient_credits') {
    const required = data.required ?? 0
    const balance = data.balance ?? 0
    return { message: `Needs ${required}, you have ${balance}`, openCredits: true, cardStatus }
  }
  return {
    message: typeof data.error === 'string' && data.error ? data.error : failLabel,
    openCredits: false,
    cardStatus: status === 409 ? cardStatus : null,
  }
}

export function presentShotFailure(
  status: number,
  data: ShotActionJson,
  failLabel: string,
): { message: string; cardStatus: ShotPlanCard['status'] | null } {
  const plan = planShotFailure(status, data, failLabel)
  toast.error(plan.message)
  if (plan.openCredits) useUIStore.getState().openCreditModal()
  return { message: plan.message, cardStatus: plan.cardStatus }
}
