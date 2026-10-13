/**
 * FAL endpoint resolution for orchestration — derived from VIDEO_MODEL_REGISTRY.
 */

import { buildVideoEndpointMaps, entryProvider, VIDEO_MODEL_REGISTRY } from '@/lib/models/registry'

const { t2v: T2V_MODEL_IDS, i2v: I2V_MODEL_IDS } = buildVideoEndpointMaps()

export { T2V_MODEL_IDS, I2V_MODEL_IDS }

const EXTERNAL_MODELS = new Set(
  Object.entries(VIDEO_MODEL_REGISTRY)
    .filter(([key, entry]) => entryProvider(key, entry) !== 'fal')
    .map(([key]) => key),
)

export function isExternallyRoutedModel(registryOrEndpoint: string): boolean {
  return EXTERNAL_MODELS.has(registryOrEndpoint)
}

export function resolveFalVideoEndpoint(
  registryModel: string,
  mode: 't2v' | 'i2v',
): string | undefined {
  if (EXTERNAL_MODELS.has(registryModel)) return registryModel
  if (mode === 'i2v') {
    return I2V_MODEL_IDS[registryModel] ?? T2V_MODEL_IDS[registryModel]
  }
  return T2V_MODEL_IDS[registryModel]
}

/** Single source of truth: anchor present + dedicated I2V path → I2V, else T2V. */
export function resolveVideoEndpoint(
  registryModel: string,
  hasStartFrame: boolean,
): string | undefined {
  if (EXTERNAL_MODELS.has(registryModel)) return registryModel
  const t2v = resolveFalVideoEndpoint(registryModel, 't2v')
  const i2v = resolveFalVideoEndpoint(registryModel, 'i2v')
  if (hasStartFrame && i2v && i2v !== t2v) return i2v
  return t2v
}
