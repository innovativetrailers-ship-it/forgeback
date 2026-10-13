import { LocalModelRefusal, submitLocalTask, type LocalTaskPayload } from './localIsolation'

export const LOCAL_MODEL_ROLES = ['t2v', 'i2v', 'image', 'upscale'] as const
export type LocalModelRole = (typeof LOCAL_MODEL_ROLES)[number]

export interface LocalModelRecord {
  id: string
  name: string
  endpoint: string
  role: LocalModelRole
  enabled: boolean
  workflow?: unknown
  /** A locally trained LoRA name. It is config, not Forge training data. */
  lora?: string
  status: 'unknown' | 'reachable' | 'down'
}

export function routableLocalModels(models: readonly LocalModelRecord[]): LocalModelRecord[] {
  return models.filter((model) => model.enabled && model.status !== 'down')
}

export function upsertLocalModel(models: readonly LocalModelRecord[], next: LocalModelRecord): LocalModelRecord[] {
  return [...models.filter((model) => model.id !== next.id), next]
}

export function setLocalModelEnabled(models: readonly LocalModelRecord[], id: string, enabled: boolean): LocalModelRecord[] {
  return models.map((model) => model.id === id ? { ...model, enabled } : model)
}

export function localModelForRole(models: readonly LocalModelRecord[], role: LocalModelRole): LocalModelRecord | null {
  return routableLocalModels(models).find((model) => model.role === role) ?? null
}

/** A chosen local model that is down fails here. Nothing else is substituted. */
export function requireLocalModel(models: readonly LocalModelRecord[], id: string): LocalModelRecord {
  const model = models.find((item) => item.id === id)
  if (!model) throw new LocalModelRefusal(`Unknown local model ${id}`, 'local')
  if (!model.enabled) throw new LocalModelRefusal(`${model.name} is disabled`, model.endpoint)
  if (model.status === 'down') {
    throw new LocalModelRefusal(`${model.name} is down`, model.endpoint)
  }
  return model
}

export async function probeLocalModel(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<'reachable' | 'down'> {
  try {
    const url = new URL(endpoint)
    const res = await fetchImpl(url.origin, { method: 'GET' })
    return res.ok ? 'reachable' : 'down'
  } catch {
    return 'down'
  }
}

export interface LocalShotRequest {
  model: LocalModelRecord
  shotPrompt: string
  seed?: number
  referenceImages?: string[]
  duration?: number
  pausedEnv?: string
}

/** Leaf submit. The meter is $0. Pause still applies. The body is the whitelist only. */
export async function runLocalShot(
  request: LocalShotRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ mediaUrl: string; costUsd: 0; libraryTake: true }> {
  if (!request.model.enabled || request.model.status === 'down') {
    throw new LocalModelRefusal(`${request.model.name} is not routable`, request.model.endpoint)
  }
  const task: Record<string, unknown> = {
    shotPrompt: request.shotPrompt,
    seed: request.seed,
    referenceImages: request.referenceImages,
    duration: request.duration,
    params: request.model.lora ? { lora: request.model.lora } : undefined,
    system: 'must not leak',
    dag: { nodes: ['plan'] },
  }
  const result = await submitLocalTask({
    endpoint: request.model.endpoint,
    allow: [request.model.endpoint],
    task,
    workflow: request.model.workflow,
    pausedEnv: request.pausedEnv,
    enabledEnv: 'true',
  }, fetchImpl)
  return { mediaUrl: result.mediaUrl, costUsd: 0, libraryTake: true }
}

export type { LocalTaskPayload }
