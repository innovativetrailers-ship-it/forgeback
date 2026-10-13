import { logCaught } from '@/lib/diagnostics/caught'
import {
  applyRecipePatch,
  asCollabRecipe,
  emptyCollabDocument,
  type CastMember,
  type CollabDocument,
  type MergeResult,
  type ShotPlanEntry,
} from '@cinema/core'
import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { broadcastCollab } from '@/lib/collab/hub'
import { logConflict } from '@/lib/collab/conflict'

function isDoc(value: unknown): value is CollabDocument {
  return Boolean(value) && typeof value === 'object' && value !== null && 'recipe' in value && 'clipClocks' in value
}

export async function loadCollabDocument(projectId: string): Promise<CollabDocument> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { timelineJson: true, scriptContent: true, collabMeta: true },
  })
  const recipe = asCollabRecipe(project?.timelineJson) ?? {
    id: projectId,
    projectId,
    tracks: [],
  }
  const meta = project?.collabMeta
  if (isDoc(meta) && meta.projectId === projectId) {
    const doc = meta as CollabDocument
    return {
      projectId: doc.projectId,
      recipe,
      clipClocks: doc.clipClocks,
      script: {
        clock: doc.script.clock,
        actor: doc.script.actor,
        at: doc.script.at,
        value: project?.scriptContent ?? doc.script.value,
      },
      cast: doc.cast,
      shotPlan: doc.shotPlan,
      playbookId: doc.playbookId,
      docClock: doc.docClock,
    }
  }
  const doc = emptyCollabDocument(projectId, recipe)
  if (project?.scriptContent) doc.script = { ...doc.script, value: project.scriptContent }
  return doc
}

export async function persistCollabMerge(projectId: string, merged: MergeResult): Promise<void> {
  const { doc } = merged
  const durationSeconds = doc.recipe.durationSeconds
  const fps = doc.recipe.fps
  const resolution = doc.recipe.resolution
    ? `${doc.recipe.resolution.width}x${doc.recipe.resolution.height}`
    : undefined

  await db.project.update({
    where: { id: projectId },
    data: {
      timelineJson: doc.recipe as unknown as Prisma.InputJsonValue,
      scriptContent: doc.script.value,
      collabMeta: doc as unknown as Prisma.InputJsonValue,
      ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
      ...(typeof fps === 'number' ? { fps } : {}),
      ...(resolution ? { resolution } : {}),
    },
  })
}

export async function applyAndBroadcastDoc(input: {
  projectId: string
  actor: string
  recipe?: unknown
  script?: string
  cast?: CastMember[]
  shotPlan?: ShotPlanEntry[]
  playbookId?: string | null
}): Promise<MergeResult> {
  const prev = await loadCollabDocument(input.projectId)
  const incomingRecipe = asCollabRecipe(input.recipe) ?? prev.recipe
  const at = Date.now()
  const extras: Parameters<typeof applyRecipePatch>[4] = {}
  if (typeof input.script === 'string') {
    extras.script = { clock: prev.script.clock + 1, actor: input.actor, at, value: input.script }
  }
  if (input.cast) {
    extras.cast = { ...prev.cast }
    for (const member of input.cast) {
      extras.cast[member.id] = {
        clock: (prev.cast[member.id]?.clock ?? 0) + 1,
        actor: input.actor,
        at,
        value: member,
      }
    }
  }
  if (input.shotPlan) {
    extras.shotPlan = { ...prev.shotPlan }
    for (const shot of input.shotPlan) {
      extras.shotPlan[shot.id] = {
        clock: (prev.shotPlan[shot.id]?.clock ?? 0) + 1,
        actor: input.actor,
        at,
        value: shot,
      }
    }
  }
  if (input.playbookId !== undefined) {
    extras.playbookId = { clock: prev.playbookId.clock + 1, actor: input.actor, at, value: input.playbookId }
  }

  const merged = applyRecipePatch(prev, incomingRecipe, input.actor, at, extras)
  await persistCollabMerge(input.projectId, merged)

  for (const warning of merged.warnings) {
    await logConflict({
      projectId: input.projectId,
      type: 'clip_move',
      userId1: warning.loser,
      userId2: warning.winner,
      clipId: warning.clipId,
      resolvedAt: new Date(),
      resolution: 'user2_wins',
    }).catch((err) => logCaught('lib/collab/doc', err))
  }

  broadcastCollab(input.projectId, {
    type: 'doc',
    recipe: merged.doc.recipe,
    script: merged.doc.script.value,
    warnings: merged.warnings,
    docClock: merged.doc.docClock,
    actor: input.actor,
  })
  if (merged.warnings.length) {
    broadcastCollab(input.projectId, { type: 'conflict', warnings: merged.warnings })
  }
  return merged
}
