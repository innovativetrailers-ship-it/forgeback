import { db } from '../db'
import { uploadToR2 } from '../storage/r2'
import { extractCharacterFeatures } from '../fal/character'
import {
  generateCharacterPlate,
  ingestPhotoReferences,
  CharacterIngestionError,
} from '../character/ingestion'
import { nanoid } from 'nanoid'
import { ensureOwnedProject } from '@/lib/projects/ensureOwnedProject'

export interface CreateCharacterInput {
  userId: string
  projectId: string
  name: string
  description?: string
  imageBuffers: Array<{ buffer: Buffer; filename: string; contentType: string }>
  triggerWord?: string
  modelFamily?: string
}

export async function createCharacter(input: CreateCharacterInput) {
  const { name, description, imageBuffers, modelFamily } = input

  const character = await db.$transaction(async (tx) => {
    const projectId = await ensureOwnedProject(input.userId, input.projectId, tx)
    return tx.vaultCharacter.create({
      data: {
        projectId,
        name,
        referenceUrls: [],
        modelFamily: modelFamily && modelFamily !== 'any' ? modelFamily : undefined,
      },
    })
  })
  const projectId = character.projectId

  try {
    let referenceUrls: string[]
    let seed: number | null = null

    if (imageBuffers.length === 0) {
      const plate = await generateCharacterPlate({
        name,
        description: description?.trim() || name,
      })
      seed = plate.seed
      const key = `vault/characters/${projectId}/${nanoid()}.png`
      const plateRes = await fetch(plate.url)
      if (!plateRes.ok) {
        throw new CharacterIngestionError('Could not persist generated character plate')
      }
      const plateBuffer = Buffer.from(await plateRes.arrayBuffer())
      referenceUrls = [await uploadToR2(plateBuffer, key, 'image/png')]
    } else {
      referenceUrls = await Promise.all(
        imageBuffers.map(async ({ buffer, filename, contentType }) => {
          const ext = filename.split('.').pop() ?? 'jpg'
          const key = `vault/characters/${projectId}/${nanoid()}.${ext}`
          return uploadToR2(buffer, key, contentType)
        }),
      )
    }

    const buffers = imageBuffers.map((b) => b.buffer)
    const ingested = await ingestPhotoReferences(referenceUrls, buffers.length ? buffers : undefined)

    const saved = await db.vaultCharacter.update({
      where: { id: character.id },
      data: {
        referenceUrls,
        seed,
        faceEmbedding: {
          embedding: ingested.faceEmbedding,
          bodyEmbedding: ingested.bodyEmbedding,
        } as never,
        styleJson: ingested.appearance as never,
      },
    })

    if (referenceUrls.length > 0) {
      extractCharacterFeatures(referenceUrls).then((features) => {
        db.vaultCharacter.update({
          where: { id: character.id },
          data: { styleJson: JSON.parse(JSON.stringify(features)) as never },
        }).catch((err) => {
          console.warn("[caught] src/lib/vault/character.ts:86", err instanceof Error ? { name: err.name, message: err.message } : err)
          console.error(err)
        })
      }).catch((err) => {
        console.warn("[caught] src/lib/vault/character.ts:87", err instanceof Error ? { name: err.name, message: err.message } : err)
        console.error(err)
      })
    }

    return saved
  } catch (err) {
    console.warn(
      '[vault/character/create] reference attach failed; character row kept',
      err instanceof Error ? err.message : err,
    )
    return character
  }
}

export async function queueCharacterLoraTraining(params: {
  userId: string
  projectId: string
  characterId: string
  imageUrls: string[]
  triggerWord: string
  confirmedCostUsd: number
  subjectConsent: boolean
}): Promise<string> {
  const {
    assertTrainingConsent,
    primaryCastTrainer,
    trainingCostUsd,
  } = await import('@cinema/core')
  const { isGenerationPaused } = await import('@/lib/generation/pause')
  if (isGenerationPaused()) {
    throw new Error('Generation is paused. Training is a paid FAL call.')
  }
  assertTrainingConsent({ tab: 'cast', subjectConsent: params.subjectConsent })
  const trainer = primaryCastTrainer()
  const steps = 1000
  const costUsd = trainingCostUsd(trainer, steps)
  if (Math.abs(costUsd - params.confirmedCostUsd) > 0.01) {
    throw new Error(`Confirm $${costUsd} and 50 credits before training`)
  }

  const { checkAndDeductCredits, OPERATION_COSTS } = await import('../credits')
  const { trainingQueue, getPriorityForRole } = await import('../queue')
  const cost = OPERATION_COSTS.lora_training ?? 50

  await checkAndDeductCredits(params.userId, 'lora_training')

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { role: true },
  })

  const renderJob = await db.renderJob.create({
    data: {
      userId: params.userId,
      projectId: params.projectId,
      type: 'LORA_TRAIN',
      status: 'QUEUED',
      creditsCharged: cost,
      modelUsed: trainer.id,
      inputPayload: {
        trainerKey: 'wan-22',
        characterId: params.characterId,
        steps,
        confirmedCostUsd: costUsd,
      },
      priority: getPriorityForRole(user?.role ?? 'FREE'),
    },
  })

  const run = await db.trainingRun.create({
    data: {
      userId: params.userId,
      jobId: renderJob.id,
      trainerKey: 'wan-22',
      trainerId: trainer.id,
      trains: trainer.trains,
      assetType: 'character',
      name: params.triggerWord,
      triggerPhrase: params.triggerWord,
      steps,
      costUsd,
      status: 'assembling',
      loraInference: trainer.loraInference,
      linkedCharacterId: params.characterId,
      subjectConsent: true,
    },
  })

  const jobData = {
    kind: 'lora' as const,
    jobId: renderJob.id,
    userId: params.userId,
    runId: run.id,
  }

  try {
    const { buildTrainingSet } = await import('@/lib/training/assemble')
    const { startTraining } = await import('@/lib/training/start')
    const assembled = await buildTrainingSet({
      trainerKey: 'wan-22',
      triggerPhrase: params.triggerWord,
      files: params.imageUrls.map((url, index) => ({
        name: `ref-${index + 1}.jpg`,
        kind: 'image' as const,
        url,
      })),
    })
    await startTraining({
      runId: run.id,
      userId: params.userId,
      jobId: renderJob.id,
      trainerKey: 'wan-22',
      dataUrl: assembled.dataUrl,
      triggerPhrase: params.triggerWord,
      steps,
      confirmedCostUsd: costUsd,
    })
  } catch (err) {
    const { failTrainingRun } = await import('@/lib/training/complete')
    const message = err instanceof Error ? err.message : 'Training failed to start'
    await failTrainingRun(run.id, message, err)
    throw err
  }

  if (process.env.VERCEL) {
    const { after } = await import('next/server')
    const { processTrainingJobWithRefund } = await import('../jobs/processTrainingJob')
    after(() => processTrainingJobWithRefund(jobData))
  } else {
    await trainingQueue.add('train', jobData, {
      priority: getPriorityForRole(user?.role ?? 'FREE'),
      attempts: 1,
    })
  }

  return renderJob.id
}

export async function getCharacter(id: string) {
  return db.vaultCharacter.findUnique({ where: { id } })
}

export async function assignVoice(
  characterId: string,
  cloneAudio?: Buffer,
): Promise<string> {
  const existing = await resolveCharacterVoiceId(characterId)
  if (existing) return existing

  const character = await db.vaultCharacter.findUnique({
    where: { id: characterId },
    select: { id: true, name: true },
  })
  if (!character) throw new Error(`Character ${characterId} not found`)

  let voiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || ''
  let voiceSource: 'library' | 'cloned' = 'library'
  if (cloneAudio) {
    const { cloneVoiceFromBuffers } = await import('@/lib/elevenlabs/client')
    voiceId = await cloneVoiceFromBuffers(character.name, [cloneAudio], `${character.name} reference`, 'audio.voice')
    voiceSource = 'cloned'
  } else if (!voiceId) {
    const { listVoicesSdk } = await import('@/lib/elevenlabs/client')
    const voices = await listVoicesSdk()
    voiceId = voices.find((voice) => voice.voiceId)?.voiceId ?? ''
  }
  if (!voiceId) throw new Error(`No ElevenLabs voice available for ${character.name}`)

  await db.vaultCharacter.update({
    where: { id: characterId },
    data: { voiceId, voiceProvider: 'elevenlabs', voiceSource },
  })
  return voiceId
}

export async function resolveCharacterVoiceId(characterId: string): Promise<string | null> {
  const character = await db.vaultCharacter.findUnique({
    where: { id: characterId },
    select: { voiceId: true, name: true, projectId: true },
  })
  if (!character) return null
  if (character.voiceId) return character.voiceId
  const cast = await db.castMember.findFirst({
    where: { projectId: character.projectId, name: character.name, voiceId: { not: null } },
    select: { voiceId: true },
  })
  return cast?.voiceId ?? null
}

export async function listCharacters(projectId?: string, userId?: string) {
  return db.vaultCharacter.findMany({
    where: userId
      ? { project: { userId } }
      : projectId
        ? { projectId }
        : {},
    orderBy: { renderCount: 'desc' },
  })
}

export async function deleteCharacter(id: string) {
  return db.vaultCharacter.delete({ where: { id } })
}
