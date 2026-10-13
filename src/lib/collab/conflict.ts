import { db } from '@/lib/db'

export type ConflictType = 'clip_move' | 'clip_delete' | 'clip_resize' | 'track_reorder'

export type ConflictResolution = 'user1_wins' | 'user2_wins' | 'merged' | null

export interface ConflictRecord {
  id: string
  projectId: string
  type: ConflictType
  userId1: string
  userId2: string
  clipId: string
  resolvedAt: Date | null
  resolution: ConflictResolution
}

export interface TimelineOperation {
  type: ConflictType
  userId: string
  clipId: string
  timestamp: number
  payload: Record<string, unknown>
}

/** Returns true if two operations touch the same clip within a 500 ms window. */
export function detectConflict(op1: TimelineOperation, op2: TimelineOperation): boolean {
  if (op1.clipId !== op2.clipId) return false
  if (op1.userId === op2.userId) return false
  return Math.abs(op1.timestamp - op2.timestamp) <= 500
}

/**
 * Resolves a conflict and returns the winning operation.
 * For 'merge' strategy, attempts to combine non-overlapping field changes.
 */
export function resolveConflict(
  conflict: ConflictRecord & { op1: TimelineOperation; op2: TimelineOperation },
  strategy: 'last_writer_wins' | 'first_writer_wins' | 'merge',
): TimelineOperation {
  const { op1, op2 } = conflict

  if (strategy === 'last_writer_wins') {
    return op1.timestamp >= op2.timestamp ? op1 : op2
  }

  if (strategy === 'first_writer_wins') {
    return op1.timestamp <= op2.timestamp ? op1 : op2
  }

  // merge: combine non-overlapping keys from both payloads, latest value wins per key
  const [earlier, later] =
    op1.timestamp <= op2.timestamp ? [op1, op2] : [op2, op1]
  const mergedPayload: Record<string, unknown> = {
    ...earlier.payload,
    ...later.payload,
  }

  return {
    ...later,
    payload: mergedPayload,
  }
}

export async function logConflict(
  conflict: Omit<ConflictRecord, 'id'>,
): Promise<ConflictRecord> {
  const record = await db.conflictLog.create({
    data: {
      projectId: conflict.projectId,
      type: conflict.type,
      userId1: conflict.userId1,
      userId2: conflict.userId2,
      clipId: conflict.clipId,
      resolvedAt: conflict.resolvedAt,
      resolution: conflict.resolution ?? undefined,
    },
  })

  return {
    id: record.id,
    projectId: record.projectId,
    type: record.type as ConflictType,
    userId1: record.userId1,
    userId2: record.userId2,
    clipId: record.clipId,
    resolvedAt: record.resolvedAt,
    resolution: (record.resolution ?? null) as ConflictResolution,
  }
}

export async function markResolved(
  conflictId: string,
  resolution: Exclude<ConflictResolution, null>,
): Promise<void> {
  await db.conflictLog.update({
    where: { id: conflictId },
    data: { resolvedAt: new Date(), resolution },
  })
}

export async function getUnresolvedConflicts(projectId: string): Promise<ConflictRecord[]> {
  const records = await db.conflictLog.findMany({
    where: { projectId, resolvedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return records.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    type: r.type as ConflictType,
    userId1: r.userId1,
    userId2: r.userId2,
    clipId: r.clipId,
    resolvedAt: r.resolvedAt,
    resolution: (r.resolution ?? null) as ConflictResolution,
  }))
}
