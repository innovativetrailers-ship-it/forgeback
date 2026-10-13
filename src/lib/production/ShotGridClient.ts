export interface ShotGridConfig {
  serverUrl: string     // e.g. https://yoursite.shotgrid.autodesk.com
  scriptName: string    // API script name from ShotGrid admin
  apiKey: string        // Script API key
  projectId: number     // ShotGrid project ID
}

export interface ShotGridShot {
  id: string
  shotCode: string
  description: string
  status: 'wtg' | 'ip' | 'fin' | 'hld' | 'omt'
  startTime: number
  endTime: number
  shotGridId?: number
}

const SHOTGRID_SERVICE = process.env.SHOTGRID_SERVICE_URL ?? 'http://localhost:7434'

async function callService<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(`${SHOTGRID_SERVICE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `ShotGrid service error: ${res.status}`)
  return json
}

export async function testShotGridConnection(config: ShotGridConfig): Promise<boolean> {
  try {
    const result = await callService<{ connected: boolean }>('test', config)
    return result.connected
  } catch (err) {
    console.warn("[caught] src/lib/production/ShotGridClient.ts:35", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}

export async function listShotGridProjects(config: ShotGridConfig): Promise<Array<{ id: number; name: string }>> {
  const result = await callService<{ projects: Array<{ id: number; name: string }> }>(
    'projects',
    { config }
  )
  return result.projects
}

export async function syncShotListToShotGrid(params: {
  config: ShotGridConfig
  shots: ShotGridShot[]
}): Promise<{ syncedCount: number; shotGridIds: Record<string, number> }> {
  return callService('sync_shots', {
    config: params.config,
    projectId: params.config.projectId,
    shots: params.shots,
  })
}

export async function updateShotStatus(params: {
  config: ShotGridConfig
  shotGridId: number
  status: 'wtg' | 'ip' | 'fin' | 'hld' | 'omt'
  outputVideoUrl?: string
  versionNote?: string
}): Promise<void> {
  await callService('update_status', {
    config: params.config,
    shotGridId: params.shotGridId,
    status: params.status,
    outputVideoUrl: params.outputVideoUrl,
    versionNote: params.versionNote,
  })
}

export async function createShotGridVersion(params: {
  config: ShotGridConfig
  shotGridShotId: number
  videoUrl: string
  versionName: string
  frameRange: string
  taskName: string
  note?: string
}): Promise<number> {
  const result = await callService<{ versionId: number }>('create_version', {
    config: params.config,
    shotGridShotId: params.shotGridShotId,
    videoUrl: params.videoUrl,
    versionName: params.versionName,
    frameRange: params.frameRange,
    taskName: params.taskName,
    note: params.note,
  })
  return result.versionId
}

export async function importShotsFromShotGrid(params: {
  config: ShotGridConfig
}): Promise<ShotGridShot[]> {
  const result = await callService<{ shots: ShotGridShot[] }>('import_shots', {
    config: params.config,
    projectId: params.config.projectId,
  })
  return result.shots
}

export async function checkShotGridHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SHOTGRID_SERVICE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch (err) {
    console.warn("[caught] src/lib/production/ShotGridClient.ts:110", err instanceof Error ? { name: err.name, message: err.message } : err)

    return false
  }
}
