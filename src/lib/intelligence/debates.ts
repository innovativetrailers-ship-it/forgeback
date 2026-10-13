import {
  BRAIN_ROUTES,
  OPEN_WEIGHT_MODEL_IDS,
  applyApprovedRoute,
  generationPausedFromEnv,
  llmModelForTask,
  postFalRouterChat,
  type BrainTask,
} from '@cinema/core'
import { db } from '@/lib/db'

export const DEBATE_CALL_CAP = 4

export interface RoutingProposal {
  task: BrainTask
  current: string
  proposed: string
  evidence: string
  benchmarkDelta: string
  cost: string
  status: 'pending' | 'approved' | 'rejected' | 'backlog'
  openWeight: boolean
}

const GUARD = /check-chokepoints|GENERATION_PAUSED|submitToFal|providerSubmit|OPEN_WEIGHT_ROUTE_PIN/

export function proposalSwapsOpenWeight(model: string): boolean {
  const id = model.trim()
  const bare = id.replace(/^fal-ai\//, '')
  const pinnedEdit = bare === 'wan-vace-14b/inpainting' || bare === 'hunyuan-video/video-to-video'
  return pinnedEdit || (OPEN_WEIGHT_MODEL_IDS as readonly string[]).includes(id)
}

export function promptNeedsSignoff(text: string): boolean {
  return /\b(remove|weaken|disable|bypass|skip|turn off)\b/i.test(text) && GUARD.test(text)
}

export function buildDevPrompt(evidence: { path: string; message: string }): { text: string; status: 'review' | 'signoff' } {
  if (!evidence.path.trim() || !evidence.message.trim()) {
    throw new Error('A dev prompt needs a real error path and message')
  }
  const text = [
    `Fix ${evidence.path}`,
    `Evidence: ${evidence.message}`,
    'Scope: the failing line only.',
    'DO NOT change billing chokepoints, GENERATION_PAUSED, safety checks, or OPEN_WEIGHT_ROUTE_PIN.',
    'VERIFY: the cited error no longer reproduces.',
  ].join('\n')
  return { text, status: promptNeedsSignoff(evidence.message) || promptNeedsSignoff(text) ? 'signoff' : 'review' }
}

export function classifyProposal(task: BrainTask, proposed: string, evidence: string): RoutingProposal {
  const current = BRAIN_ROUTES[task].primary
  const openWeight = proposalSwapsOpenWeight(proposed)
  const status = openWeight
    ? 'backlog'
    : !evidence.trim()
      ? 'rejected'
      : 'pending'
  return {
    task,
    current,
    proposed: proposed.trim(),
    evidence,
    benchmarkDelta: 'not measured this run',
    cost: 'debate budget capped at 4 router calls',
    status,
    openWeight,
  }
}

async function saveReport(generatedBy: string, reportJson: unknown): Promise<string> {
  const row = await db.modelReport.create({
    data: {
      engineId: 'orchestrator',
      engineVersion: 'wave-3',
      reportDate: new Date(),
      generatedBy,
      reportJson: reportJson as object,
      probeCount: 0,
    },
  })
  console.log('[debate_stored]', { id: row.id, generatedBy })
  return row.id
}

async function debateText(task: BrainTask, role: 'lead' | 'critic', evidence: string): Promise<string> {
  const model = role === 'lead'
    ? llmModelForTask('premise').model
    : llmModelForTask('scene').model
  const result = await postFalRouterChat({
    model,
    source: 'intelligence.debate',
    maxTokens: 400,
    webSearch: true,
    messages: [
      {
        role: 'user',
        content: `${role === 'lead' ? 'Propose' : 'Criticise'} one routing change for brain task ${task}. Current primary is ${BRAIN_ROUTES[task].primary}. Evidence:\n${evidence}\nReturn JSON {"proposed":"provider/model","because":"one sentence"}. Do not propose an open-weight base.`,
      },
    ],
  })
  return result.content
}

export async function runBiweeklyDebate(): Promise<RoutingProposal> {
  const { refreshPoolOnMiss } = await import('@/lib/cognition/liveCapability')
  const pool = ['seedance-2.0', 'kling-3.0', 'veo-3.1', 'gemini-omni', 'wan-2.7']
  await refreshPoolOnMiss(pool).catch((err) => {
    console.warn('[know_live] biweekly seed kept', err instanceof Error ? err.message : err)
  })
  console.log('[know_live] biweekly refresh', pool)
  const task: BrainTask = 'script'
  const paused = generationPausedFromEnv(process.env.GENERATION_PAUSED)
  const evidence = paused
    ? 'Generation is paused. No paid debate. Routing stays on the configured primary.'
    : await (async () => {
      let calls = 0
      const lead = await debateText(task, 'lead', 'Live FAL OpenAPI remains the schema source.')
      calls += 1
      const critic = calls < DEBATE_CALL_CAP
        ? await debateText(task, 'critic', lead)
        : 'call cap reached'
      return `lead: ${lead}\ncritic: ${critic}`
    })()
  const proposal = classifyProposal(task, BRAIN_ROUTES[task].primary, evidence)
  if (!paused && evidence.includes('"proposed"')) {
    const match = evidence.match(/"proposed"\s*:\s*"([^"]+)"/)
    if (match?.[1]) {
      const next = classifyProposal(task, match[1], evidence)
      await saveReport('biweekly-debate', next)
      console.log('[debate_biweekly]', next)
      return next
    }
  }
  await saveReport('biweekly-debate', proposal)
  console.log('[debate_biweekly]', proposal)
  return proposal
}

export async function approveRoutingProposal(id: string): Promise<RoutingProposal> {
  const row = await db.modelReport.findUnique({ where: { id } })
  if (!row || row.generatedBy !== 'biweekly-debate') throw new Error('Routing proposal not found')
  const proposal = row.reportJson as unknown as RoutingProposal
  if (proposal.openWeight || proposal.status === 'backlog') {
    throw new Error('Open-weight notes stay in the backlog')
  }
  if (proposal.status === 'rejected' || !proposal.proposed || proposal.proposed === proposal.current) {
    throw new Error('This proposal does not change routing')
  }
  applyApprovedRoute(proposal.task, proposal.proposed)
  const approved = { ...proposal, status: 'approved' as const }
  await db.modelReport.update({
    where: { id },
    data: { reportJson: approved },
  })
  return approved
}

export async function runMonthlyGapDebate(): Promise<{ gaps: Array<{ rank: number; title: string; note: string }> }> {
  const paused = generationPausedFromEnv(process.env.GENERATION_PAUSED)
  const gaps = [
    {
      rank: 1,
      title: 'Competitor gap report',
      note: paused
        ? 'Generation is paused. Captured for triage. Nothing was built.'
        : 'Debate the field only. Capture the gap. Do not build it.',
    },
  ]
  if (!paused) {
    const result = await postFalRouterChat({
      model: llmModelForTask('premise').model,
      source: 'intelligence.gap',
      maxTokens: 500,
      webSearch: true,
      messages: [{
        role: 'user',
        content: 'Name one product gap between a film-generation studio and current video tools. One sentence. Do not propose code.',
      }],
    })
    gaps[0].note = result.content.slice(0, 500)
  }
  await saveReport('monthly-gap', { gaps, builds: false })
  console.log('[debate_monthly]', gaps)
  return { gaps }
}

export async function pushOneDevPrompt(): Promise<{ status: 'review' | 'signoff'; text: string } | null> {
  const recent = await db.modelReport.findFirst({
    where: { generatedBy: 'cursor-pusher' },
    orderBy: { createdAt: 'desc' },
  })
  const week = 7 * 24 * 60 * 60 * 1000
  if (recent && Date.now() - recent.createdAt.getTime() < week) return null
  const error = await db.shotError.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!error?.userMessage) return null
  const built = buildDevPrompt({
    path: error.endpoint || 'shot-error',
    message: error.userMessage,
  })
  await saveReport('cursor-pusher', { ...built, evidence: error.userMessage, autoMerge: false })
  console.log('[cursor_pusher]', { status: built.status })
  return built
}
