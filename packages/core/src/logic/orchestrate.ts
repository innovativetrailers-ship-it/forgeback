import { partitionContinuity, type ChainLink, type GateDecision, type GateMode } from './chainContinuity'
import { delegate, type DelegateProject, type DelegateResult, type DelegateShot } from './delegate'
import type { LearnedByPurpose } from './modelKnowledge'
import { queryModelRAG } from './modelKnowledge'
import type { PremiseLock, ShotPurpose } from './premiseLock'
import { applyPlaybookToShots } from './playbook'

export const ORCHESTRATE_STAGES = [
  'premise',
  'interpret',
  'delegate',
  'generate',
  'gate',
  'learn',
  'assemble',
] as const

export type OrchestrateStage = (typeof ORCHESTRATE_STAGES)[number]

export type OrchestrateShot = DelegateShot & {
  chainLink?: ChainLink
}

export interface OrchestrateProject extends DelegateProject {
  gateMode: GateMode
  skipInterpret?: boolean
  directedShots?: OrchestrateShot[]
  premise?: PremiseLock
}

export interface OrchestrateHost {
  premiseLock(script: string): Promise<PremiseLock>
  interpretToShots(script: string, premise: PremiseLock): Promise<{ shots: OrchestrateShot[] }>
  generateShot(shot: OrchestrateShot, delegated: DelegateResult): Promise<{ ok: boolean; failed?: boolean }>
  qualityGate(shot: OrchestrateShot, gateMode: GateMode): Promise<GateDecision>
  recordOutcome(shot: OrchestrateShot, delegated: DelegateResult, signal: string): Promise<void>
  assemble(shots: Array<OrchestrateShot & { delegation: DelegateResult }>): Promise<{ ok: boolean }>
  /** Production batch render (chains, escrow, stitch). Runs once after delegate, before per-shot gate. */
  afterDelegate?(shots: Array<OrchestrateShot & { delegation: DelegateResult }>): Promise<void>
}

export interface OrchestrateResult {
  premise: PremiseLock
  shots: Array<OrchestrateShot & { delegation: DelegateResult }>
  stages: readonly OrchestrateStage[]
  skippedInterpret: boolean
}

export function emptyPremise(story = 'Directed shot'): PremiseLock {
  return { characters: [], settings: [], story, genre: '', tone: '' }
}

export function scheduleDAG(plan: { shots: Array<{ id: string; chainLink?: ChainLink; chainFrom?: string | null }> }) {
  return partitionContinuity(plan.shots.map((shot) => ({
    id: shot.id,
    link: shot.chainLink ?? (shot.chainFrom ? 'video' : 'none'),
  })))
}

export function handleGate(gate: GateDecision): 'continue' | 'regenerate' | 'await_user' {
  if (gate === 'pass') return 'continue'
  return gate
}

export function resolveBypass(project: OrchestrateProject, shot: OrchestrateShot): {
  skipInterpret: boolean
  manualModel: string | null
  gateMode: GateMode
} {
  return {
    skipInterpret: Boolean(project.skipInterpret),
    manualModel: shot.modelOverride?.trim() || null,
    gateMode: project.gateMode,
  }
}

function shotId(shot: OrchestrateShot, index: number): string {
  return shot.id ?? `shot-${index}`
}

/**
 * Compose interpret → delegate → generate/gate → learn → assemble.
 * Hosts supply generate/assemble. Manual override and skipInterpret stay user-owned.
 */
export async function orchestrate(
  script: string,
  project: OrchestrateProject,
  host: OrchestrateHost,
  pool?: readonly string[],
  learned?: Record<string, Partial<LearnedByPurpose>>,
): Promise<OrchestrateResult> {
  let premise: PremiseLock
  let planned: OrchestrateShot[]
  if (project.skipInterpret) {
    if (!project.directedShots?.length) {
      throw new Error('Direct a shot to skip interpretation')
    }
    premise = project.premise ?? emptyPremise(script.trim() || 'Directed shot')
    planned = project.directedShots
  } else {
    premise = await host.premiseLock(script)
    planned = (await host.interpretToShots(script, premise)).shots
  }
  planned = applyPlaybookToShots(planned, project.playbook)

  const shots: Array<OrchestrateShot & { delegation: DelegateResult }> = []
  for (const shot of planned) {
    const delegation = await delegate(shot, project, pool, learned)
    shots.push({ ...shot, delegation })
  }

  const scheduled = scheduleDAG({
    shots: shots.map((shot, index) => ({
      id: shotId(shot, index),
      chainLink: shot.chainLink,
      chainFrom: shot.chainFrom,
    })),
  })
  const byId = new Map(shots.map((shot, index) => [shotId(shot, index), shot]))
  if (host.afterDelegate) await host.afterDelegate(shots)

  async function runUnit(id: string): Promise<void> {
    const shot = byId.get(id)
    if (!shot) return
    let result = await host.generateShot(shot, shot.delegation)
    if (result.failed) {
      await host.recordOutcome(shot, shot.delegation, 'failed')
      return
    }
    let gate = await host.qualityGate(shot, project.gateMode)
    let action = handleGate(gate)
    if (action === 'regenerate') {
      await host.recordOutcome(shot, shot.delegation, 'regenerate')
      result = await host.generateShot(shot, shot.delegation)
      if (result.failed) {
        await host.recordOutcome(shot, shot.delegation, 'failed')
        return
      }
      gate = await host.qualityGate(shot, project.gateMode)
      action = handleGate(gate)
    }
    if (action === 'await_user') return
    await host.recordOutcome(shot, shot.delegation, 'approved_at_gate')
  }

  for (const chain of scheduled.chains) {
    for (const unit of chain.shots) await runUnit(unit.id)
  }
  await Promise.all(scheduled.independents.map((unit) => runUnit(unit.id)))
  await host.assemble(shots)

  return {
    premise,
    shots,
    stages: ORCHESTRATE_STAGES,
    skippedInterpret: Boolean(project.skipInterpret),
  }
}

/** True when a rating overlay moves the top model for that purpose. */
export function delegationShiftsForPurpose(
  purpose: ShotPurpose,
  pool: readonly string[],
  overlay: Record<string, Partial<LearnedByPurpose>>,
  project: Pick<DelegateProject, 'qualityTier' | 'taste'>,
): { before: string; after: string; shifted: boolean } {
  const need = {
    purpose,
    needs: { mode: 'text' as const, audio: purpose === 'dialogue' },
    constraint: { tier: project.qualityTier },
  }
  const before = queryModelRAG(need, pool, undefined, project.taste)
  const after = queryModelRAG(need, pool, overlay, project.taste)
  const first = before[0]?.model ?? ''
  const next = after[0]?.model ?? ''
  return { before: first, after: next, shifted: Boolean(first && next && first !== next) }
}
