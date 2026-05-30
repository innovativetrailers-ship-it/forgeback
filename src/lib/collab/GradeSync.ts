/**
 * GradeSync — real-time collaborative colour grading via Server-Sent Events.
 * Multiple users in Ultimate mode see live CDL grade changes from other editors.
 */

import type { CDLValues } from '@/lib/color/CDLWheels'

export interface GradeState {
  clipId:     string
  cdl:        CDLValues
  lutPreset?: string
  lutUrl?:    string
  intensity:  number
  lockedBy?:  string    // userId who has claimed the grade
}

export interface GradeSyncEvent {
  type:       'grade_update' | 'grade_lock' | 'grade_unlock' | 'undo'
  projectId:  string
  clipId:     string
  userId:     string
  grade?:     Partial<GradeState>
  timestamp:  number
}

// In-memory grade state per project (production: use Redis pub/sub)
const gradeStates = new Map<string, Map<string, GradeState>>()
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>()

function getProjectGrades(projectId: string) {
  if (!gradeStates.has(projectId)) gradeStates.set(projectId, new Map())
  return gradeStates.get(projectId)!
}

function getProjectSubscribers(projectId: string) {
  if (!subscribers.has(projectId)) subscribers.set(projectId, new Set())
  return subscribers.get(projectId)!
}

/** Subscribe to grade updates for a project (SSE stream) */
export function subscribeToGrades(projectId: string): ReadableStream {
  const subs = getProjectSubscribers(projectId)

  return new ReadableStream({
    start(controller) {
      subs.add(controller)

      // Send current state on connect
      const grades = getProjectGrades(projectId)
      for (const [clipId, grade] of grades) {
        const event: GradeSyncEvent = {
          type:      'grade_update',
          projectId,
          clipId,
          userId:    'server',
          grade,
          timestamp: Date.now(),
        }
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      }
    },
    cancel(controller) {
      subs.delete(controller)
    },
  })
}

/** Broadcast a grade update to all subscribers */
export function broadcastGrade(event: GradeSyncEvent): void {
  const grades = getProjectGrades(event.projectId)
  const subs   = getProjectSubscribers(event.projectId)

  if (event.type === 'grade_update' && event.grade) {
    const existing = grades.get(event.clipId)
    grades.set(event.clipId, { ...existing, ...event.grade } as GradeState)
  }

  if (event.type === 'grade_lock') {
    const existing = grades.get(event.clipId)
    if (existing) existing.lockedBy = event.userId
  }

  if (event.type === 'grade_unlock') {
    const existing = grades.get(event.clipId)
    if (existing && existing.lockedBy === event.userId) delete existing.lockedBy
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const controller of subs) {
    try {
      controller.enqueue(payload)
    } catch {
      subs.delete(controller)
    }
  }
}

/** Claim exclusive grade lock on a clip */
export function claimGrade(projectId: string, clipId: string, userId: string): boolean {
  const grades   = getProjectGrades(projectId)
  const existing = grades.get(clipId)

  if (existing?.lockedBy && existing.lockedBy !== userId) return false

  if (!existing) grades.set(clipId, { clipId, cdl: { lift: { r: 0, g: 0, b: 0 }, gamma: { r: 1, g: 1, b: 1 }, gain: { r: 1, g: 1, b: 1 } }, intensity: 1 })
  grades.get(clipId)!.lockedBy = userId

  return true
}
