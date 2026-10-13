import { MODEL_COSTS } from '@/lib/routing/engineRegistry'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import type { ChainedClip, StructuredShot } from './types'
import type { AnchorPolicy } from './types'

export interface SceneGroup {
  sceneNumber: number
  sceneId:     string
  shots:       StructuredShot[]
}

export function groupIntoScenes(shots: StructuredShot[]): SceneGroup[] {
  const groups = new Map<number, StructuredShot[]>()
  for (const shot of shots) {
    const sn = shot.sceneNumber ?? shot.continuityGroup ?? 1
    const list = groups.get(sn) ?? []
    list.push(shot)
    groups.set(sn, list)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sceneNumber, sceneShots]) => ({
      sceneNumber,
      sceneId: `scene-${sceneNumber}`,
      shots: sceneShots.sort((a, b) => a.shotIndex - b.shotIndex),
    }))
}

function pickModel(shot: StructuredShot, selectedModels: string[]): string {
  const suggested = shot.suggestedModel
  if (suggested && selectedModels.includes(suggested)) return suggested
  return [...selectedModels]
    .sort((a, b) => (MODEL_COSTS[a] ?? 99) - (MODEL_COSTS[b] ?? 99))[0] ?? refuseSilentModelSwap('pool', 'ltx-2.3-fast')
}

export function buildChainForScene(
  scene: SceneGroup,
  selectedModels: string[],
  modelByShotIndex: Map<number, string>,
  _crossSceneAnchor?: string,
  _isFirstScene = false,
): ChainedClip[] {
  return scene.shots.map((shot, i) => {
    const isFirstShotOfScene = i === 0
    const anchorPolicy: AnchorPolicy =
      isFirstShotOfScene
        ? (shot.storyboardUrl ? 'keyframe' : 'none')
        : 'previous-frame'

    return {
      id:             `clip-${shot.shotIndex}`,
      sceneId:        scene.sceneId,
      sceneNumber:    scene.sceneNumber,
      shotNumber:     shot.shotIndex + 1,
      prompt:         shot.visualPrompt,
      duration:       shot.duration,
      aspectRatio:    '16:9',
      assignedModel:  modelByShotIndex.get(shot.shotIndex) ?? pickModel(shot, selectedModels),
      keyframeUrl:    shot.storyboardUrl,
      anchorPolicy,
      scriptBeatId:   shot.scriptBeatId,
      shotIndex:      shot.shotIndex,
      contentType:    shot.contentType,
      visualPrompt:   shot.visualPrompt,
      hasDialogue:    shot.hasDialogue,
      hasFaces:       shot.hasFaces,
      charactersPresent: shot.charactersPresent ?? [],
      lighting:       shot.lighting,
    }
  })
}
