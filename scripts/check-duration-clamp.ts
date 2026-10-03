import { buildPayload, logPayloadClamp } from '../packages/core/src/logic/payload'
import { familyDurationConstraint } from '../packages/core/src/logic/familyDuration'
import { KLING_V3_TEXT, klingDuration, klingDurationConstraint } from '../packages/core/src/logic/kling'
import { LTX_FAST_TEXT, LTX_TEXT, ltxDuration, ltxDurationConstraint } from '../packages/core/src/logic/ltx'
import { PIKA_TEXT, pikaDuration, pikaDurationConstraint } from '../packages/core/src/logic/pika'
import { RUNWAY_GEN45, RUNWAY_GEN4_TURBO, runwayDuration, runwayDurationConstraint } from '../packages/core/src/logic/runway'
import { WAN_REFERENCE, WAN_TEXT, wanDuration, wanDurationConstraint } from '../packages/core/src/logic/wan'

const logs: string[] = []
const original = console.log
console.log = (...args: unknown[]) => {
  const line = args.map((part) => String(part)).join(' ')
  if (line.includes('[payload_clamped]')) logs.push(line)
  else original(...args)
}

function reset(): void {
  logs.length = 0
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const staleEnum = ['3', '15']
const baseConstraints = {
  endpoint: KLING_V3_TEXT,
  required: ['prompt'],
  forbidden: [],
  enums: { duration: staleEnum },
  types: { prompt: 'string' as const, duration: 'string' as const },
  audioField: null,
  schemaHash: 'test',
  fetchedAt: 0,
  properties: ['prompt', 'duration'],
}

function sealed(endpoint: string, seconds: number): unknown {
  reset()
  const constraint = familyDurationConstraint(endpoint)
  if (!constraint) throw new Error(`no family duration for ${endpoint}`)
  const payload = buildPayload(endpoint, {
    prompt: 'A woman sits in a cafe.',
    duration: seconds,
  }, { ...baseConstraints, endpoint, enums: { duration: staleEnum } }, {
    durationConstraint: constraint,
    onClamp: (field, want, picked, model) => logPayloadClamp(field, want, picked, model),
  })
  return payload.duration
}

const cases: Array<{ endpoint: string; valid: number; seal: (n: number) => string | number }> = [
  { endpoint: KLING_V3_TEXT, valid: 4, seal: (n) => klingDuration(n, KLING_V3_TEXT) },
  { endpoint: 'fal-ai/kling-video/v1.6/standard/text-to-video', valid: 5, seal: (n) => klingDuration(n, 'fal-ai/kling-video/v1.6/standard/text-to-video') },
  { endpoint: LTX_TEXT, valid: 8, seal: (n) => ltxDuration(n, false, undefined, LTX_TEXT) },
  { endpoint: LTX_FAST_TEXT, valid: 12, seal: (n) => ltxDuration(n, true, undefined, LTX_FAST_TEXT) },
  { endpoint: WAN_TEXT, valid: 4, seal: (n) => wanDuration(n, false) },
  { endpoint: WAN_REFERENCE, valid: 10, seal: (n) => wanDuration(n, true) },
  { endpoint: PIKA_TEXT, valid: 5, seal: (n) => pikaDuration(n, PIKA_TEXT) },
  { endpoint: RUNWAY_GEN45, valid: 5, seal: (n) => runwayDuration(n, RUNWAY_GEN45) },
  { endpoint: RUNWAY_GEN4_TURBO, valid: 5, seal: (n) => runwayDuration(n, RUNWAY_GEN4_TURBO) },
]

for (const row of cases) {
  reset()
  const clamp = sealed(row.endpoint, row.valid)
  const clampLogs = logs.length
  reset()
  const seal = row.seal(row.valid)
  assert(clampLogs === 0, `${row.endpoint} valid ${row.valid} logged a clamp`)
  assert(logs.length === 0, `${row.endpoint} seal logged a clamp for valid ${row.valid}`)
  assert(String(clamp) === String(seal), `${row.endpoint} clamp ${String(clamp)} != seal ${String(seal)}`)
}

reset()
const kling4 = sealed(KLING_V3_TEXT, 4)
assert(String(kling4) === '4', `kling 4 sealed ${String(kling4)}`)
assert(logs.length === 0, 'kling 4 logged payload_clamped')
assert(String(klingDuration(4, KLING_V3_TEXT)) === '4', 'seal kling 4')
assert(logs.length === 0, 'seal kling 4 logged')

reset()
assert(String(klingDuration(20, KLING_V3_TEXT)) === '15', 'kling 20')
assert(logs.some((line) => line.includes('"from":20') && line.includes('"to":"15"')), 'kling 20 clamp log')

reset()
assert(String(klingDuration(2, KLING_V3_TEXT)) === '3', 'kling 2')
assert(logs.some((line) => line.includes('"from":2') && line.includes('"to":"3"')), 'kling 2 clamp log')

reset()
const ltx7 = ltxDuration(7, false, undefined, LTX_TEXT)
assert(ltx7 === 6 || ltx7 === 8, `ltx 7 snapped to ${ltx7}`)
assert(logs.length === 1, 'ltx 7 should log once')
assert(String(sealed(LTX_TEXT, 7)) === String(ltx7), 'ltx clamp and seal disagree on 7')

assert(klingDurationConstraint(KLING_V3_TEXT).shape === 'range', 'kling v3 is a range')
assert(klingDurationConstraint('fal-ai/kling-video/v1.6/standard/text-to-video').shape === 'set', 'kling v2 is a set')
assert(ltxDurationConstraint(false).shape === 'set', 'ltx is a set')
assert(wanDurationConstraint(false).shape === 'set', 'wan is a set')
assert(pikaDurationConstraint().shape === 'set', 'pika is a set')
assert(runwayDurationConstraint().shape === 'range', 'runway is a range')
assert(familyDurationConstraint(RUNWAY_GEN45)?.shape === 'range', 'gen4.5 family duration')
assert(familyDurationConstraint(RUNWAY_GEN4_TURBO)?.shape === 'range', 'gen4_turbo family duration')
assert(familyDurationConstraint('runway-gen4')?.shape === 'range', 'runway-gen4 family duration')

reset()
assert(pikaDuration(5, PIKA_TEXT) === 5, 'pika 5')
assert(logs.length === 0, 'pika 5 logged')
reset()
const pika7 = pikaDuration(7, PIKA_TEXT)
assert(pika7 === 5 || pika7 === 10, 'pika 7 snaps to the set')
assert(logs.length === 1, 'pika 7 should log once')

reset()
assert(runwayDuration(5, RUNWAY_GEN45) === 5, 'runway 5')
assert(logs.length === 0, 'runway 5 logged')
reset()
assert(runwayDuration(12, RUNWAY_GEN45) === 10, 'runway 12')
assert(logs.length === 1, 'runway 12 should log once')
assert(logs.some((line) => line.includes('"from":12') && line.includes('"to":10')), 'runway 12 clamp log')
reset()
assert(String(sealed(RUNWAY_GEN45, 12)) === '10', 'runway seal 12')
assert(logs.length === 1, 'runway seal 12 should log once')

console.log = original
console.log('DURATION_CLAMP_OK', JSON.stringify({ kling4, ltx7 }))
