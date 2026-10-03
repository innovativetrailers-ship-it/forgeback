import { redis } from '@/lib/redis'

const PRESENCE_TTL = 30 // seconds

export interface PresenceState {
  userId: string
  displayName: string
  avatarUrl: string | null
  color: string
  playheadTime: number
  selectedClipId: string | null
  role?: string
  typing?: boolean
  editing?: { kind: string; id: string } | null
  cursor?: { x: number; y: number } | null
  lastSeen: number
}

const PRESENCE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
]

function colorForUser(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

function presenceKey(projectId: string, userId: string): string {
  return `presence:${projectId}:${userId}`
}

function presenceIndexKey(projectId: string): string {
  return `presence:${projectId}:__index`
}

export async function updatePresence(
  projectId: string,
  userId: string,
  patch: Partial<Omit<PresenceState, 'userId' | 'color' | 'lastSeen'>>,
): Promise<void> {
  const key = presenceKey(projectId, userId)
  const existing = await redis.get(key)
  const prev: Partial<PresenceState> = existing ? (JSON.parse(existing) as PresenceState) : {}

  const updated: PresenceState = {
    userId,
    displayName: patch.displayName ?? prev.displayName ?? 'Unknown',
    avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : (prev.avatarUrl ?? null),
    color: prev.color ?? colorForUser(userId),
    playheadTime: patch.playheadTime ?? prev.playheadTime ?? 0,
    selectedClipId:
      patch.selectedClipId !== undefined
        ? patch.selectedClipId
        : (prev.selectedClipId ?? null),
    role: patch.role ?? prev.role,
    typing: patch.typing ?? prev.typing,
    editing: patch.editing !== undefined ? patch.editing : (prev.editing ?? null),
    cursor: patch.cursor !== undefined ? patch.cursor : (prev.cursor ?? null),
    lastSeen: Date.now(),
  }

  const pipeline = redis.pipeline()
  pipeline.set(key, JSON.stringify(updated), 'EX', PRESENCE_TTL)
  pipeline.sadd(presenceIndexKey(projectId), userId)
  pipeline.expire(presenceIndexKey(projectId), PRESENCE_TTL * 2)
  await pipeline.exec()
}

export async function getProjectPresence(projectId: string): Promise<PresenceState[]> {
  const indexKey = presenceIndexKey(projectId)
  const userIds = await redis.smembers(indexKey)
  if (userIds.length === 0) return []

  const keys = userIds.map((uid) => presenceKey(projectId, uid))
  const values = await redis.mget(...keys)

  const results: PresenceState[] = []
  const staleUsers: string[] = []

  for (let i = 0; i < values.length; i++) {
    const raw = values[i]
    if (raw) {
      results.push(JSON.parse(raw) as PresenceState)
    } else {
      staleUsers.push(userIds[i])
    }
  }

  if (staleUsers.length > 0) {
    await redis.srem(indexKey, ...staleUsers)
  }

  return results
}

export async function removePresence(projectId: string, userId: string): Promise<void> {
  const pipeline = redis.pipeline()
  pipeline.del(presenceKey(projectId, userId))
  pipeline.srem(presenceIndexKey(projectId), userId)
  await pipeline.exec()
}
