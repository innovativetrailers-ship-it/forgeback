import type { ModelDef } from '../types/provider'
import { loraInferenceDef } from './trainerRegistry'
import { resolveModel, resolveVideoEndpoint } from './resolveModel'

export class ModelIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelIntegrityError'
  }
}

export function assertModelIntegrity(
  selectedId: string,
  def: ModelDef,
  endpoint: string,
  hasStartFrame = false,
  hasCharacterRefs = false,
): void {
  const expected = resolveModel(selectedId)
  if (expected.canonicalId !== def.canonicalId) {
    throw new ModelIntegrityError(
      `Model substitution detected: user selected '${selectedId}' ` +
        `(canonical ${expected.canonicalId}) but dispatch resolved '${def.canonicalId}'.`,
    )
  }

  if (def.provider !== 'fal') return

  if (loraInferenceDef(expected.canonicalId) || loraInferenceDef(endpoint)) {
    const allowed = new Set(
      [
        expected.falEndpoint,
        expected.i2vEndpoint,
        expected.referenceEndpoint,
        ...Object.values(expected.endpoints ?? {}),
      ].filter((value): value is string => Boolean(value)),
    )
    if (allowed.has(endpoint)) return
  }

  if (hasCharacterRefs && def.referenceEndpoint && endpoint === def.referenceEndpoint) return

  const modeEndpoint = def.endpoints?.first_last === endpoint || def.endpoints?.video_edit === endpoint
  if (modeEndpoint) return

  const expectedEndpoint = resolveVideoEndpoint(expected.canonicalId, hasStartFrame)
  if (!expectedEndpoint) {
    throw new ModelIntegrityError(`Model '${selectedId}' has no FAL endpoint mapping`)
  }
  if (endpoint !== expectedEndpoint) {
    throw new ModelIntegrityError(
      `Model substitution detected: user selected '${selectedId}' ` +
        `(endpoint ${expectedEndpoint}) but about to submit ${endpoint}. Refusing — no silent swaps.`,
    )
  }
}
