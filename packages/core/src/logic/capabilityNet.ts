export const CONTROL_STATUSES = ['wired', 'ui-only', 'stub', 'absent'] as const
export type ControlStatus = (typeof CONTROL_STATUSES)[number]

export const CONTROL_SYSTEMS = [
  'generation',
  'color',
  'lighting',
  'editing',
  'vfx',
  'cgi',
  'audio',
  'style',
  'production',
  'intelligence',
] as const
export type ControlSystem = (typeof CONTROL_SYSTEMS)[number]

export const GATED_CONTROLS = [
  'lastFrame',
  'firstFrame',
  'voice',
  'audioToggle',
  'seed',
  'negative',
  'reference',
] as const
export type GatedControl = (typeof GATED_CONTROLS)[number]

export interface ControlRecord {
  id: string
  name: string
  system: ControlSystem
  status: ControlStatus
  falseClaim?: boolean
  file?: string
  note?: string
}

export interface CapabilityCaps {
  lastFrame: boolean
  firstFrame: boolean
  voice: string
  audioToggle: boolean
  seed: boolean
  negative: boolean
  reference: boolean
}

export interface ControlGate {
  visible: boolean
  reason?: string
}

export interface ClaimCheck {
  id: string
  label: string
  claimed: number
  backed: number
  unit: string
}

export const SPEC_SYSTEM_FILES: Array<{ file: string; system: ControlSystem }> = [
  { file: 'SPEC-01-generation-camera.md', system: 'generation' },
  { file: 'SPEC-02-color-grading.md', system: 'color' },
  { file: 'SPEC-03-lighting-shading.md', system: 'lighting' },
  { file: 'SPEC-04-editing-nle.md', system: 'editing' },
  { file: 'SPEC-05-vfx-compositing.md', system: 'vfx' },
  { file: 'SPEC-06-cgi-overlays.md', system: 'cgi' },
  { file: 'SPEC-07-audio.md', system: 'audio' },
  { file: 'SPEC-08-style-look.md', system: 'style' },
  { file: 'SPEC-09-production-delivery.md', system: 'production' },
  { file: 'SPEC-10-llm-intelligence.md', system: 'intelligence' },
]

/** Documented UI-ONLY controls. A new id not in this list is a regression. */
export const KNOWN_UI_ONLY = [
  'generation/native-audio-toggle',
  'generation/quality-tier-draft-studio-blockbuster',
  'editing/jkl-trim',
  'vfx/web-green-screen-apply',
  'cgi/web-ai-template',
] as const

export const KNOWN_STUBS = [
  'audio/stem-separation',
  'audio/dubbing',
  'audio/per-language-re-lipsync',
  'audio/parametric-eq',
  'style/genre-lut-pack',
  'cgi/planar-track',
  'vfx/4-point-planar-track',
  'vfx/lens-flare',
  'production/subtitle-translation',
  'editing/multicam-2-up-4-up',
  'editing/sync-by-timecode',
  'editing/sync-by-waveform',
  'editing/audio-sync',
  'editing/camera-raw-import-braw-r3d-arri-mxf-crm-n-raw-s-raw',
  'editing/prores-import',
  'lighting/skin-tone-line',
] as const

export const KNOWN_FALSE_CLAIMS = [
  'cgi/200-effect-library',
  'vfx/100-effect-rack',
] as const

export const KNOWN_DEAD_HANDLERS = [
  'src/components/panels/GreenScreenPanel.tsx',
  'src/components/panels/SFXMakeupPanel.tsx',
] as const

const HEADING =
  /^###\s+(.+?)\s+\[(WIRED|UI-ONLY|STUB|ABSENT)(?:\/FALSE-CLAIM)?[^\]]*\]/

export function isControlStatus(value: string): value is ControlStatus {
  return (CONTROL_STATUSES as readonly string[]).includes(value)
}

export function controlSlug(system: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${system}/${slug}`
}

export function parseControlHeading(line: string): {
  name: string
  status: ControlStatus
  falseClaim: boolean
} | null {
  const match = line.match(HEADING)
  if (!match) return null
  const status = match[2].toLowerCase() as ControlStatus
  return {
    name: match[1].trim(),
    status,
    falseClaim: /FALSE-CLAIM/i.test(line),
  }
}

export function parseAuditHeader(text: string): {
  wired: number
  uiOnly: number
  stub: number
  absent: number
} | null {
  const match = text.match(
    /Audit:\s*(\d+)\s*WIRED\s*\/\s*(\d+)\s*UI-ONLY\s*\/\s*(\d+)\s*STUB\s*\/\s*(\d+)\s*ABSENT/i,
  )
  if (!match) return null
  return {
    wired: Number(match[1]),
    uiOnly: Number(match[2]),
    stub: Number(match[3]),
    absent: Number(match[4]),
  }
}

export function parseSpecControls(markdown: string, system: ControlSystem): ControlRecord[] {
  const rows: ControlRecord[] = []
  for (const line of markdown.split('\n')) {
    const parsed = parseControlHeading(line)
    if (!parsed) continue
    rows.push({
      id: controlSlug(system, parsed.name),
      name: parsed.name,
      system,
      status: parsed.status,
      falseClaim: parsed.falseClaim || undefined,
    })
  }
  return rows
}

export function countByStatus(rows: ControlRecord[]): Record<ControlStatus, number> {
  const counts: Record<ControlStatus, number> = { wired: 0, 'ui-only': 0, stub: 0, absent: 0 }
  for (const row of rows) counts[row.status] += 1
  return counts
}

export function deadControls(rows: ControlRecord[]): ControlRecord[] {
  return rows.filter((row) => row.status === 'ui-only' || row.status === 'stub' || row.falseClaim)
}

export function unlistedIds(found: string[], known: readonly string[]): string[] {
  const allow = new Set(known)
  return found.filter((id) => !allow.has(id))
}

export function auditCountsMatch(
  parsed: Record<ControlStatus, number>,
  header: { wired: number; uiOnly: number; stub: number; absent: number },
): boolean {
  return (
    parsed.wired === header.wired
    && parsed['ui-only'] === header.uiOnly
    && parsed.stub === header.stub
    && parsed.absent === header.absent
  )
}

export function gateModelControl(caps: CapabilityCaps, control: GatedControl): ControlGate {
  switch (control) {
    case 'lastFrame':
      return caps.lastFrame
        ? { visible: true }
        : { visible: false, reason: 'This model has no last-frame field.' }
    case 'firstFrame':
      return caps.firstFrame
        ? { visible: true }
        : { visible: false, reason: 'This model has no first-frame field.' }
    case 'voice':
      return caps.voice && caps.voice !== 'none'
        ? { visible: true }
        : { visible: false, reason: 'This model has no voice field.' }
    case 'audioToggle':
      return caps.audioToggle
        ? { visible: true }
        : { visible: false, reason: 'Native audio is locked off for this model.' }
    case 'seed':
      return caps.seed
        ? { visible: true }
        : { visible: false, reason: 'This model has no seed field.' }
    case 'negative':
      return caps.negative
        ? { visible: true }
        : { visible: false, reason: 'This model has no negative-prompt field.' }
    case 'reference':
      return caps.reference
        ? { visible: true }
        : { visible: false, reason: 'This model has no reference field.' }
  }
}

export function claimMatches(claimed: number, backed: number): boolean {
  return claimed === backed
}

export function claimOverstated(claimed: number, backed: number): boolean {
  return claimed > backed
}

export function claimHonesty(checks: ClaimCheck[]): ClaimCheck[] {
  return checks.filter((row) => claimOverstated(row.claimed, row.backed) || !claimMatches(row.claimed, row.backed))
}
