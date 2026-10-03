import { klingDurationConstraint } from './kling'
import { ltxDurationConstraint } from './ltx'
import { pikaDurationConstraint } from './pika'
import type { DurationConstraint } from './payload'
import { runwayDurationConstraint } from './runway'
import { wanDurationConstraint } from './wan'

/** The duration constraint the seal uses. The clamp must call this, not a stored enum. */
export function familyDurationConstraint(endpoint: string): DurationConstraint | null {
  if (endpoint.includes('kling-video')) return klingDurationConstraint(endpoint)
  if (endpoint.includes('ltx-2.3')) return ltxDurationConstraint(endpoint.includes('/fast'))
  if (endpoint.includes('/wan/v2.7/')) return wanDurationConstraint(endpoint.includes('reference-to-video'))
  if (endpoint.includes('/pika/')) return pikaDurationConstraint()
  if (endpoint.includes('runway') || endpoint === 'gen4.5' || endpoint === 'gen4_turbo') {
    return runwayDurationConstraint()
  }
  return null
}

export function durationEnumFromConstraint(constraint: DurationConstraint): (string | number)[] {
  if (constraint.shape === 'set') return [...constraint.values]
  const values: (string | number)[] = []
  for (let n = constraint.min; n <= constraint.max; n += 1) {
    values.push(constraint.wire === 'string' ? String(n) : n)
  }
  return values
}
