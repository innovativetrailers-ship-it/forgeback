import { VIDEO_MODEL_REGISTRY, type RegistryEntry } from '@cinema/core'
import { generationPausedFromEnv } from '@cinema/core'
import { SERVICE_REGISTRY } from '@/lib/services/registry'
import { RelayRefused } from '@/lib/billing/relayMeter'
import { serverEstimate } from '@/lib/billing/relayPolicy'

export interface RelayTarget {
  key: string
  endpoint: string
  category: string
  estimate: number
}

/** Registry key, or an endpoint string that exactly matches one registry row. Anything else is refused. */
export function resolveRelayTarget(token: string): RelayTarget {
  const raw = token.trim()
  if (!raw) throw new RelayRefused('Choose a model.')
  const direct = (VIDEO_MODEL_REGISTRY as Record<string, RegistryEntry>)[raw]
  if (direct && !direct.isExternal && direct.falEndpoint) {
    return { key: raw, endpoint: direct.falEndpoint, category: 'video', estimate: serverEstimate('video') }
  }
  for (const [key, entry] of Object.entries(VIDEO_MODEL_REGISTRY) as Array<[string, RegistryEntry]>) {
    if (entry.isExternal) continue
    if (entry.falEndpoint === raw || entry.i2vEndpoint === raw) {
      return { key, endpoint: entry.falEndpoint, category: 'video', estimate: serverEstimate('video') }
    }
  }
  const service = SERVICE_REGISTRY[raw]
  if (service && service.category === 'llm' && service.access !== 'direct') {
    return { key: raw, endpoint: raw, category: 'llm', estimate: serverEstimate('llm') }
  }
  throw new RelayRefused('That model is not available.')
}

export function pauseReason(envValue: string | undefined = process.env.GENERATION_PAUSED): string | null {
  return generationPausedFromEnv(envValue) ? 'Generation is paused.' : null
}
