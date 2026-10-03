import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  claimHonesty,
  countByStatus,
  deadControls,
  parseAuditHeader,
  parseSpecControls,
  SPEC_SYSTEM_FILES,
  type ClaimCheck,
  type ControlRecord,
  type ControlSystem,
} from '@cinema/core'
import { FILM_EMULATION_LUTS } from '@/lib/studio/colour'
import { SUPPORTED_RAW_FORMATS } from '@/lib/storage/raw-ingest'

const CLIP_EFFECTS = 15
const REAL_MOGRT = 12
const STUB_MOGRT = 200

function specDir(): string {
  return join(process.cwd(), 'docs/spec-references')
}

export function loadControlRegistry(): ControlRecord[] {
  const rows: ControlRecord[] = []
  for (const spec of SPEC_SYSTEM_FILES) {
    const markdown = readFileSync(join(specDir(), spec.file), 'utf8')
    rows.push(...parseSpecControls(markdown, spec.system))
  }
  rows.push({
    id: 'lighting/sfx-makeup-apply',
    name: 'SFX Makeup Apply',
    system: 'lighting',
    status: 'ui-only',
    file: 'src/components/panels/SFXMakeupPanel.tsx',
    note: 'Apply TODO — no pipeline path',
  })
  return rows
}

export function queryDeadControls(system?: ControlSystem) {
  const rows = deadControls(loadControlRegistry())
  const filtered = system ? rows.filter((row) => row.system === system) : rows
  return {
    total: filtered.length,
    uiOnly: filtered.filter((row) => row.status === 'ui-only'),
    stub: filtered.filter((row) => row.status === 'stub'),
    falseClaim: filtered.filter((row) => row.falseClaim),
    bySystem: countByStatus(filtered),
    inventory: filtered,
  }
}

export function registrySummary() {
  const rows = loadControlRegistry()
  const byFile = SPEC_SYSTEM_FILES.map((spec) => {
    const markdown = readFileSync(join(specDir(), spec.file), 'utf8')
    const parsed = parseSpecControls(markdown, spec.system)
    return {
      file: spec.file,
      system: spec.system,
      header: parseAuditHeader(markdown),
      counts: countByStatus(parsed),
    }
  })
  return {
    total: rows.length,
    counts: countByStatus(rows),
    dead: deadControls(rows).length,
    byFile,
  }
}

export function backedClaims(): ClaimCheck[] {
  return [
    { id: 'vfx-effects', label: 'pre-rendered VFX effects', claimed: 200, backed: CLIP_EFFECTS, unit: 'effects' },
    { id: 'mogrt', label: 'MoGRT templates', claimed: STUB_MOGRT, backed: REAL_MOGRT, unit: 'templates' },
    { id: 'raw-formats', label: 'RAW camera formats', claimed: SUPPORTED_RAW_FORMATS.length, backed: 0, unit: 'formats' },
    { id: 'film-luts', label: 'film emulation LUTs', claimed: Object.keys(FILM_EMULATION_LUTS).length, backed: Object.keys(FILM_EMULATION_LUTS).length, unit: 'luts' },
  ]
}

export function claimMismatches(): ClaimCheck[] {
  return claimHonesty(backedClaims())
}
