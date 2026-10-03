import { db } from '@/lib/db'
import { listShotPlan } from '@/lib/studio/shotPlan'
import type { StructuredShot } from './types'

export interface ShotDialogue {
  shotId: number
  clipId?: string
  characterId: string
  voiceId: string
  text: string
  durationHint: number
}

export async function extractDialogueForShots(
  shots: StructuredShot[],
  projectId: string | undefined,
): Promise<Map<number, ShotDialogue>> {
  const map = new Map<number, ShotDialogue>()
  if (!projectId) return map

  const characters = await db.vaultCharacter.findMany({
    where: { projectId },
    select: { id: true, name: true, voiceId: true },
  })
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]))

  const { shots: planShots } = await listShotPlan(projectId)
  const clipByShotIndex = new Map(
    planShots.map((s) => [s.shotNumber - 1, s.id]),
  )

  for (const shot of shots) {
    if (!shot.hasDialogue) continue
    const speaker = shot.charactersPresent?.[0]
    if (!speaker) continue
    const char = byName.get(speaker.toLowerCase())
    if (!char) continue
    let voiceId = char.voiceId
    if (!voiceId && projectId) {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { userId: true } })
      if (project) {
        const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(project.userId, projectId).catch((err) => {
          console.warn("[caught] src/lib/orchestration/dialogueExtractor.ts:42", err instanceof Error ? { name: err.name, message: err.message } : err)
          return (null)
        })
        voiceId = playbook?.language?.voiceDefaults ?? voiceId
      }
    }
    if (!voiceId) {
      try {
        const { assignVoice } = await import('@/lib/vault/character')
        voiceId = await assignVoice(char.id)
        char.voiceId = voiceId
      } catch (err) {
        console.warn('[dialogue] voice assign skipped:', err instanceof Error ? err.message : String(err))
        continue
      }
    }

    const quoted = shot.visualPrompt.match(/"([^"]{3,})"/)
    const text = quoted?.[1] ?? shot.visualPrompt.slice(0, 240)
    const clipId = clipByShotIndex.get(shot.shotIndex)

    map.set(shot.shotIndex, {
      shotId: shot.shotIndex,
      clipId,
      characterId: char.id,
      voiceId,
      text,
      durationHint: shot.duration,
    })

    if (!clipId) continue

    const existing = await db.audioTrack.findFirst({
      where: { projectId, shotPlanId: clipId, type: 'DIALOGUE' },
    })

    if (existing?.locked) continue

    if (existing) {
      if (existing.prompt !== text) {
        await db.audioTrack.update({
          where: { id: existing.id },
          data: {
            prompt: text,
            voiceId,
            status: existing.status === 'READY' ? 'PENDING' : existing.status,
          },
        })
      }
    } else {
      await db.audioTrack.create({
        data: {
          projectId,
          type: 'DIALOGUE',
          provider: 'ELEVENLABS',
          status: 'PENDING',
          prompt: text,
          voiceId,
          shotPlanId: clipId,
          sceneNumber: shot.sceneNumber,
        },
      })
    }
  }

  return map
}
