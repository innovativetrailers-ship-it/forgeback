export const WIZARD_STAGES = ['script', 'references', 'keyframes', 'shots'] as const
export type WizardStage = (typeof WIZARD_STAGES)[number]
export type DirectorRunMode = 'wizard' | 'hybrid' | 'auto'
export type BatchDepth = 'shot' | 'scene' | 'n' | 'all'

export interface WizardGates {
  script: boolean
  references: boolean
  keyframes: boolean
  shots: boolean
}

export interface WizardRunConfig {
  mode: DirectorRunMode
  gates: WizardGates
  batchDepth: BatchDepth
  batchCount: number
  cleared: WizardStage[]
  shotCursor: number
  spendCredits: number
  ownLicence: boolean
  subjectConsent: boolean
  /** When false, this run skips the cognitive director and uses the lean plan. */
  cognition: boolean
}

export class WizardHold extends Error {
  readonly stage: WizardStage
  readonly next: WizardRunConfig

  constructor(stage: WizardStage, next: WizardRunConfig) {
    super(`Awaiting you at ${stage}`)
    this.name = 'WizardHold'
    this.stage = stage
    this.next = next
  }
}

export function defaultWizard(mode: DirectorRunMode = 'wizard'): WizardRunConfig {
  const gates: WizardGates = mode === 'hybrid'
    ? { script: true, references: false, keyframes: true, shots: false }
    : { script: true, references: true, keyframes: true, shots: true }
  return {
    mode,
    gates,
    batchDepth: 'all',
    batchCount: 1,
    cleared: [],
    shotCursor: 0,
    spendCredits: 0,
    ownLicence: false,
    subjectConsent: false,
    cognition: true,
  }
}

export function parseWizard(value: unknown): WizardRunConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<WizardRunConfig>
  if (row.mode !== 'wizard' && row.mode !== 'hybrid' && row.mode !== 'auto') return undefined
  const base = defaultWizard(row.mode)
  const gates = row.gates && typeof row.gates === 'object' ? row.gates : base.gates
  return {
    ...base,
    ...row,
    mode: row.mode,
    gates: {
      script: Boolean(gates.script),
      references: Boolean(gates.references),
      keyframes: Boolean(gates.keyframes),
      shots: Boolean(gates.shots),
    },
    cleared: Array.isArray(row.cleared)
      ? row.cleared.filter((stage): stage is WizardStage => (WIZARD_STAGES as readonly string[]).includes(String(stage)))
      : [],
    shotCursor: Number.isFinite(row.shotCursor) ? Math.max(0, Math.floor(row.shotCursor ?? 0)) : 0,
    batchCount: Number.isFinite(row.batchCount) && (row.batchCount ?? 0) > 0 ? Math.floor(row.batchCount ?? 1) : 1,
    ownLicence: Boolean(row.ownLicence),
    subjectConsent: Boolean(row.subjectConsent),
    cognition: row.cognition !== false,
  }
}

export function gateOpen(config: WizardRunConfig | undefined, stage: WizardStage): boolean {
  if (!config || config.mode === 'auto') return false
  const on = config.mode === 'wizard' ? true : config.gates[stage]
  return on && !config.cleared.includes(stage)
}

export function holdFor(config: WizardRunConfig, stage: WizardStage): never {
  throw new WizardHold(stage, config)
}

export function clearStage(config: WizardRunConfig, stage: WizardStage): WizardRunConfig {
  return {
    ...config,
    cleared: config.cleared.includes(stage) ? config.cleared : [...config.cleared, stage],
  }
}

export function batchLimit(config: WizardRunConfig, remaining: number): number {
  if (config.batchDepth === 'all') return remaining
  if (config.batchDepth === 'shot') return 1
  if (config.batchDepth === 'n') return Math.max(1, config.batchCount)
  return Math.max(1, Math.min(remaining, 4))
}
