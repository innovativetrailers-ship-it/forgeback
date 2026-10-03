import { nanoid } from 'nanoid'
import type { TimelineRecipe } from '../timeline/schema'

export interface Participant {
  userId: string
  name: string
  avatarUrl?: string
  color: string
  cursorPosition?: { x: number; y: number }
  activeClipId?: string
}

export interface CollabComment {
  id: string
  projectId: string
  authorId: string
  authorName: string
  timecode: number
  clipId?: string
  text: string
  annotationData?: unknown
  resolved: boolean
  createdAt: Date
}

export interface TimelineSnapshot {
  id: string
  projectId: string
  recipe: TimelineRecipe
  createdAt: Date
  createdBy: string
  label: string
}

// In-memory session store (replace with Redis for multi-server)
const sessions = new Map<string, {
  participants: Map<string, Participant>
  activeClipLocks: Map<string, string>
  snapshots: TimelineSnapshot[]
}>()

const PARTICIPANT_COLORS = [
  '#00e5c8', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

export function getOrCreateSession(projectId: string) {
  if (!sessions.has(projectId)) {
    sessions.set(projectId, {
      participants: new Map(),
      activeClipLocks: new Map(),
      snapshots: [],
    })
  }
  return sessions.get(projectId)!
}

export function joinSession(projectId: string, participant: Omit<Participant, 'color'>) {
  const session = getOrCreateSession(projectId)
  const colorIdx = session.participants.size % PARTICIPANT_COLORS.length
  const color = PARTICIPANT_COLORS[colorIdx]
  session.participants.set(participant.userId, { ...participant, color })
  return color
}

export function leaveSession(projectId: string, userId: string) {
  const session = sessions.get(projectId)
  if (!session) return
  session.participants.delete(userId)
  // Release any clip locks held by this user
  for (const [clipId, lockUserId] of session.activeClipLocks) {
    if (lockUserId === userId) session.activeClipLocks.delete(clipId)
  }
}

export function lockClip(projectId: string, clipId: string, userId: string): boolean {
  const session = getOrCreateSession(projectId)
  const existingLock = session.activeClipLocks.get(clipId)
  if (existingLock && existingLock !== userId) return false
  session.activeClipLocks.set(clipId, userId)
  return true
}

export function unlockClip(projectId: string, clipId: string, userId: string) {
  const session = getOrCreateSession(projectId)
  if (session.activeClipLocks.get(clipId) === userId) {
    session.activeClipLocks.delete(clipId)
  }
}

export async function saveSnapshot(
  projectId: string,
  recipe: TimelineRecipe,
  userId: string,
  label?: string
): Promise<TimelineSnapshot> {
  const snapshot: TimelineSnapshot = {
    id: nanoid(),
    projectId,
    recipe,
    createdAt: new Date(),
    createdBy: userId,
    label: label ?? `Snapshot ${new Date().toLocaleTimeString()}`,
  }
  const session = getOrCreateSession(projectId)
  session.snapshots.unshift(snapshot)
  // Keep last 20 snapshots
  if (session.snapshots.length > 20) session.snapshots.splice(20)
  return snapshot
}

export function getSnapshots(projectId: string): TimelineSnapshot[] {
  return sessions.get(projectId)?.snapshots ?? []
}

export function getSessionState(projectId: string) {
  const session = sessions.get(projectId)
  if (!session) return null
  return {
    participants: Array.from(session.participants.values()),
    activeClipLocks: Object.fromEntries(session.activeClipLocks),
    snapshotCount: session.snapshots.length,
  }
}
