import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import {
  chainLink,
  chainModelChoice,
  continuityPriorityFor,
  isVideoReferenceCapable,
  shotContinuityFlag,
  type ChainLink,
} from '@cinema/core'
import type { DAGNode, StructuredShot } from './types'

export interface ChainReroute {
  shotIndex: number
  from: string
  to: string
}

function sceneKey(shot: StructuredShot): string {
  return `scene-${shot.sceneNumber ?? shot.continuityGroup ?? 1}`
}

function locationKey(shot: StructuredShot): string {
  const named = (shot.locationsPresent ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean).sort()
  if (named.length) return named.join('|')
  const id = (shot as { locationId?: string | null }).locationId?.trim()
  return id ?? ''
}

/** Sets continuity, chainFrom, and chainLink from the shot data. A hard cut never chains. */
export function annotateContinuity(
  shots: StructuredShot[],
  dag: DAGNode[],
  selectedModels: readonly string[],
): ChainReroute[] {
  const ordered = [...shots].sort((a, b) => a.shotIndex - b.shotIndex)
  const modelByIndex = new Map(dag.map((node) => [node.shot.shotIndex, node]))
  const reroutes: ChainReroute[] = []
  for (let i = 0; i < ordered.length; i++) {
    const shot = ordered[i]
    const prev = i > 0 ? ordered[i - 1] : undefined
    const priority = continuityPriorityFor(shot.contentType)
    const sceneId = sceneKey(shot)
    const prevScene = prev ? sceneKey(prev) : ''
    const prevLocation = prev ? locationKey(prev) : ''
    const location = locationKey(shot)
    const sameLocation = !prevLocation || !location || prevLocation === location
    const flag = shotContinuityFlag({
      hasPrev: Boolean(prev),
      sameScene: Boolean(prev) && sceneId === prevScene,
      sameLocation,
      hardCut: shot.startsAtHardCut === true || shot.continuity === 'cut',
      lowPriority: priority === 'low',
    })
    const isCut = flag === 'cut'
    const node = modelByIndex.get(shot.shotIndex)
    const routed = node?.assignedModel ?? shot.suggestedModel ?? refuseSilentModelSwap(`shot ${shot.shotIndex}`, 'ltx-2.3-fast')
    const wanted = !isCut && priority !== 'low' && Boolean(prev)
    let model = routed
    if (wanted && !isVideoReferenceCapable(routed)) {
      const choice = chainModelChoice(routed, selectedModels)
      if (choice && choice !== routed && node) {
        reroutes.push({ shotIndex: shot.shotIndex, from: routed, to: choice })
        node.assignedModel = choice
        model = choice
      }
    }
    const capable = isVideoReferenceCapable(model)
    const link: ChainLink = chainLink(
      { id: `shot-${shot.shotIndex}`, sceneId, isCut, continuityPriority: priority },
      prev ? { id: `shot-${prev.shotIndex}`, sceneId: prevScene, continuityPriority: continuityPriorityFor(prev.contentType) } : null,
      capable,
    )
    shot.continuityPriority = priority
    shot.continuity = flag
    shot.isCut = isCut
    shot.chainLink = link
    shot.chainFrom = link === 'video' && prev ? `shot-${prev.shotIndex}` : null
  }
  return reroutes
}

export async function persistChainLinks(projectId: string, shots: StructuredShot[]): Promise<void> {
  const { db } = await import('@/lib/db')
  const { getOrderedClips } = await import('@/lib/studio/advanceChain')
  const ordered = await getOrderedClips(db, projectId)
  const idByIndex = new Map(ordered.map((clip) => [clip.shotNumber - 1, clip.id]))
  for (const shot of shots) {
    const id = idByIndex.get(shot.shotIndex)
    if (!id) continue
    const prevIndex = shot.chainFrom?.startsWith('shot-') ? Number(shot.chainFrom.slice(5)) : NaN
    const prevId = Number.isFinite(prevIndex) ? idByIndex.get(prevIndex) ?? null : null
    await db.studioClip.update({ where: { id }, data: { chainFrom: prevId } })
  }
}
