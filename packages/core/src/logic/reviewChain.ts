export type ApprovalStepStatus = 'pending' | 'approved' | 'changes-requested'

export interface ApprovalStep {
  role: string
  userId?: string
  status: ApprovalStepStatus
  at?: string
  note?: string
}

export type ReviewOverall = 'in_review' | 'approved' | 'changes-requested'

const STATUSES = new Set<ApprovalStepStatus>(['pending', 'approved', 'changes-requested'])

export function defaultApprovalChain(): ApprovalStep[] {
  return [
    { role: 'Director', status: 'pending' },
    { role: 'Producer', status: 'pending' },
    { role: 'Client', status: 'pending' },
  ]
}

export function parseApprovalChain(value: unknown): ApprovalStep[] {
  if (!Array.isArray(value) || value.length === 0) return defaultApprovalChain()
  const steps: ApprovalStep[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const role = typeof row.role === 'string' ? row.role.trim() : ''
    const status = typeof row.status === 'string' && STATUSES.has(row.status as ApprovalStepStatus)
      ? row.status as ApprovalStepStatus
      : 'pending'
    if (!role) continue
    const step: ApprovalStep = { role, status }
    if (typeof row.userId === 'string' && row.userId.trim()) step.userId = row.userId.trim()
    if (typeof row.at === 'string') step.at = row.at
    if (typeof row.note === 'string') step.note = row.note
    steps.push(step)
  }
  return steps.length ? steps : defaultApprovalChain()
}

export function reviewOverall(chain: readonly ApprovalStep[]): ReviewOverall {
  if (chain.every((step) => step.status === 'approved')) return 'approved'
  if (chain.some((step) => step.status === 'changes-requested')) return 'changes-requested'
  return 'in_review'
}

/** The step that may act. Earlier pending steps come before a bounced step. */
export function actionableStep(chain: readonly ApprovalStep[]): number {
  return chain.findIndex((step) => step.status !== 'approved')
}

export function advanceApproval(
  chain: readonly ApprovalStep[],
  action: { decision: 'approved' | 'changes-requested'; actor: string; note?: string; at?: string },
): { chain: ApprovalStep[]; overall: ReviewOverall; shotApproved: boolean; step: number } {
  const next = chain.map((step) => ({ ...step }))
  const index = actionableStep(next)
  if (index < 0) {
    return { chain: next, overall: 'approved', shotApproved: true, step: -1 }
  }
  const at = action.at ?? new Date().toISOString()
  if (action.decision === 'changes-requested') {
    for (let i = 0; i < index; i++) next[i] = { role: next[i].role, ...(next[i].userId ? { userId: next[i].userId } : {}), status: 'pending' }
    next[index] = {
      role: next[index].role,
      ...(next[index].userId ? { userId: next[index].userId } : {}),
      status: 'changes-requested',
      at,
      note: action.note?.trim() || `${action.actor} requested changes`,
    }
    return { chain: next, overall: 'changes-requested', shotApproved: false, step: index }
  }
  next[index] = {
    ...next[index],
    status: 'approved',
    at,
    ...(action.note?.trim() ? { note: action.note.trim() } : {}),
  }
  const overall = reviewOverall(next)
  return { chain: next, overall, shotApproved: overall === 'approved', step: index }
}
