import { randomUUID } from 'crypto'
import { redis } from '@/lib/redis'

export interface CameraSession {
  sessionId: string
  projectId: string
  userId: string
  status: 'active' | 'idle' | 'stopped'
  startedAt: number
  chunkCount: number
}

export interface ChunkMetadata {
  chunkId: string
  sessionId: string
  projectId: string
  chunkIndex: number
  durationSeconds: number
  r2Key: string
  status: 'uploaded' | 'transcoded' | 'transcribed' | 'done'
}

const SESSION_TTL = 6 * 60 * 60
const CHUNK_TTL = 7 * 24 * 60 * 60

const sessionKey = (id: string) => `camera:session:${id}`
const sessionChunkSet = (id: string) => `camera:session:${id}:chunks`
const chunkKey = (id: string) => `camera:chunk:${id}`

function isCameraSession(v: unknown): v is CameraSession {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.sessionId === 'string' && typeof o.projectId === 'string' &&
    typeof o.userId === 'string' && typeof o.status === 'string' &&
    ['active', 'idle', 'stopped'].includes(o.status as string) &&
    typeof o.startedAt === 'number' && typeof o.chunkCount === 'number'
}

function isChunkMetadata(v: unknown): v is ChunkMetadata {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.chunkId === 'string' && typeof o.sessionId === 'string' &&
    typeof o.projectId === 'string' && typeof o.chunkIndex === 'number' &&
    typeof o.durationSeconds === 'number' && typeof o.r2Key === 'string' &&
    typeof o.status === 'string'
}

export async function createCameraSession(projectId: string, userId: string): Promise<CameraSession> {
  const session: CameraSession = {
    sessionId: randomUUID(),
    projectId,
    userId,
    status: 'active',
    startedAt: Date.now(),
    chunkCount: 0,
  }
  await redis.set(sessionKey(session.sessionId), JSON.stringify(session), 'EX', SESSION_TTL)
  return session
}

export async function getCameraSession(sessionId: string): Promise<CameraSession | null> {
  const raw = await redis.get(sessionKey(sessionId))
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch (err) {
    console.warn("[caught] src/lib/camera/WirelessIngest.ts:65", err instanceof Error ? { name: err.name, message: err.message } : err)
 return null }
  return isCameraSession(parsed) ? parsed : null
}

export async function stopCameraSession(sessionId: string): Promise<void> {
  const session = await getCameraSession(sessionId)
  if (!session) return
  await redis.set(sessionKey(sessionId), JSON.stringify({ ...session, status: 'stopped' }), 'EX', SESSION_TTL)
}

export async function recordChunkMetadata(meta: Omit<ChunkMetadata, 'status'>): Promise<void> {
  const full: ChunkMetadata = { ...meta, status: 'uploaded' }
  await redis.set(chunkKey(meta.chunkId), JSON.stringify(full), 'EX', CHUNK_TTL)
  await redis.sadd(sessionChunkSet(meta.sessionId), meta.chunkId)
  await redis.expire(sessionChunkSet(meta.sessionId), CHUNK_TTL)

  const session = await getCameraSession(meta.sessionId)
  if (session) {
    await redis.set(
      sessionKey(meta.sessionId),
      JSON.stringify({ ...session, chunkCount: session.chunkCount + 1 }),
      'EX', SESSION_TTL,
    )
  }
}

export async function getSessionChunks(sessionId: string): Promise<ChunkMetadata[]> {
  const chunkIds = await redis.smembers(sessionChunkSet(sessionId))
  if (chunkIds.length === 0) return []

  const chunks = await Promise.all(
    chunkIds.map(async (id) => {
      const raw = await redis.get(chunkKey(id))
      if (!raw) return null
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch (err) {
        console.warn("[caught] src/lib/camera/WirelessIngest.ts:100", err instanceof Error ? { name: err.name, message: err.message } : err)
 return null }
      return isChunkMetadata(parsed) ? parsed : null
    }),
  )

  return chunks
    .filter((c): c is ChunkMetadata => c !== null)
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
}
