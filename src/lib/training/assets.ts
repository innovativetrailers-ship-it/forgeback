import {
  OPEN_WEIGHT_BASES,
  assetTypeFromTrainer,
  trainerDef,
  type LoraAssetRef,
} from '@cinema/core'
import { WAN22_BACKUP_KEY } from '@/lib/training/baseBackup'
import { db } from '@/lib/db'

export function toLoraRef(asset: {
  loraUrl: string
  triggerPhrase?: string | null
  loraInference?: string | null
} | null | undefined): LoraAssetRef | undefined {
  if (!asset?.loraUrl?.trim()) return undefined
  return {
    loraUrl: asset.loraUrl,
    triggerPhrase: asset.triggerPhrase,
    loraInference: asset.loraInference,
  }
}

export async function assetsForShot(input: {
  userId: string
  characterIds?: string[]
  characterLoraId?: string | null
  styleLoraId?: string | null
  projectStyleLoraId?: string | null
}): Promise<{ characterLora?: LoraAssetRef; styleLora?: LoraAssetRef }> {
  let characterLora: LoraAssetRef | undefined
  if (input.characterLoraId) {
    const row = await db.trainedAsset.findFirst({
      where: { id: input.characterLoraId, userId: input.userId, deletedAt: null, type: 'character' },
    })
    characterLora = toLoraRef(row)
  }
  if (!characterLora && input.characterIds?.length) {
    const chars = await db.vaultCharacter.findMany({
      where: { id: { in: input.characterIds }, trainedAssetId: { not: null } },
      select: { trainedAssetId: true, loraModelId: true, loraStatus: true },
    })
    const assetId = chars.find((row) => row.trainedAssetId)?.trainedAssetId
    if (assetId) {
      const row = await db.trainedAsset.findFirst({
        where: { id: assetId, userId: input.userId, deletedAt: null },
      })
      characterLora = toLoraRef(row)
    }
  }

  let styleLora: LoraAssetRef | undefined
  const styleId = input.styleLoraId ?? input.projectStyleLoraId
  if (styleId) {
    const row = await db.trainedAsset.findFirst({
      where: { id: styleId, userId: input.userId, deletedAt: null },
    })
    styleLora = toLoraRef(row)
  }
  return { characterLora, styleLora }
}

export async function promoteTrainingRunToAsset(runId: string): Promise<string | null> {
  const run = await db.trainingRun.findUnique({ where: { id: runId } })
  if (!run?.loraUrl || run.status !== 'complete') return null
  if (run.trainedAssetId) return run.trainedAssetId

  const type = assetTypeFromTrainer(run.trains)
  const asset = await db.trainedAsset.create({
    data: {
      userId: run.userId,
      name: run.name,
      description: run.description,
      type,
      loraUrl: run.loraUrl,
      configUrl: run.configUrl,
      triggerPhrase: run.triggerPhrase,
      trainerId: run.trainerId,
      loraInference: run.loraInference,
      subcategory: run.subcategory || '',
      linkedCharacterId: run.linkedCharacterId,
      trainingRunId: run.id,
    },
  })
  await db.trainingRun.update({
    where: { id: run.id },
    data: { trainedAssetId: asset.id },
  })

  const trainer = trainerDef(run.trainerKey)
  const baseModel = trainer?.base ?? 'wan-2.2'
  const pin = {
    weightsKey: run.loraUrl,
    baseModel,
    baseVersion: baseModel,
    baseBackupKey: baseModel === 'wan-2.2' ? WAN22_BACKUP_KEY : `${baseModel}-backup`,
    usableAsReference: true,
    resolutionState: 'trained',
    trainedAssetId: asset.id,
    sourceRefs: run.dataUrl ? [run.dataUrl] : [],
  }
  const linked = run.linkedCharacterId
    ? await db.asset.findUnique({ where: { vaultCharacterId: run.linkedCharacterId } })
    : null
  if (linked) {
    await db.asset.update({ where: { id: linked.id }, data: pin })
  } else {
    await db.asset.create({
      data: {
        ownerId: run.userId,
        kind: type === 'audio_style' ? 'voice' : type === 'character' ? 'character' : 'style',
        ...pin,
        vaultCharacterId: run.linkedCharacterId,
      },
    })
  }
  console.log('[asset_handoff]', {
    assetId: asset.id,
    baseModel,
    ownerId: run.userId,
    openTrainer: baseModel === 'wan-2.2' ? OPEN_WEIGHT_BASES['wan-2.2'].trainer : null,
  })

  if (type === 'character' && run.linkedCharacterId) {
    const character = await db.vaultCharacter.findFirst({
      where: { id: run.linkedCharacterId, project: { userId: run.userId } },
    })
    if (character) {
      await db.vaultCharacter.update({
        where: { id: character.id },
        data: {
          trainedAssetId: asset.id,
          loraModelId: run.loraUrl,
          loraStatus: 'READY',
          modelFamily: run.trainerKey,
        },
      })
    }
  }
  return asset.id
}
