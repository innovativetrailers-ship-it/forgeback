import type { VaultCharacter, WardrobeItem as PrismaWardrobe } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { nanoid } from 'nanoid'
import {
  defaultAppearance,
  mergeAppearance,
  parseAppearanceJson,
  parseEmbeddingJson,
  type CharacterAppearance,
  type FCCCharacter,
  type FCCCharacterView,
  type WardrobeItem,
  type WardrobeRegion,
} from './fccSchema'

type VaultRow = VaultCharacter & { wardrobe?: PrismaWardrobe[] }

function wardrobeFromPrisma(items: PrismaWardrobe[]): WardrobeItem[] {
  return items.map((w) => ({
    id: w.id,
    region: w.region as WardrobeRegion,
    prompt: w.prompt,
    refImageUrl: w.refImageUrl,
    lockedHash: w.lockedHash,
    appliedAt: w.appliedAt.toISOString(),
  }))
}

export function vaultToFCC(row: VaultRow): FCCCharacter {
  const refs = row.referenceUrls ?? []
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    faceEmbedding: parseEmbeddingJson(row.faceEmbedding),
    bodyEmbedding: parseEmbeddingJson(row.bodyEmbedding),
    loraWeightsRef: row.loraModelId ?? undefined,
    refFront: refs[0] ?? '',
    refProfile: row.refProfile ?? refs[1] ?? undefined,
    ref3Quarter: row.ref3Quarter ?? refs[2] ?? undefined,
    refBack: row.refBack ?? refs[3] ?? undefined,
    appearance: parseAppearanceJson(row.appearance),
    wardrobe: wardrobeFromPrisma(row.wardrobe ?? []),
    behavioralPrompt: row.behavioralPrompt ?? '',
  }
}

export function toFCCView(char: FCCCharacter): FCCCharacterView {
  return {
    ...char,
    refFrontUrl: char.refFront || null,
    refProfileUrl: char.refProfile ?? null,
    ref3QuarterUrl: char.ref3Quarter ?? null,
    refBackUrl: char.refBack ?? null,
    hasFcc: char.faceEmbedding.length > 0,
  }
}

export async function getFCCCharacter(characterId: string, userId: string): Promise<FCCCharacterView | null> {
  const row = await db.vaultCharacter.findUnique({
    where: { id: characterId },
    include: { wardrobe: true, project: { select: { userId: true } } },
  })
  if (!row || row.project.userId !== userId) return null
  return toFCCView(vaultToFCC(row))
}

export async function listFCCSummaries(projectId: string, userId: string) {
  const rows = await db.vaultCharacter.findMany({
    where: { projectId, project: { userId } },
    include: { wardrobe: true },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((row) => {
    const fcc = vaultToFCC(row)
    return {
      id: row.id,
      name: row.name,
      refFront: fcc.refFront || null,
      refFrontUrl: fcc.refFront || null,
      hasFcc: fcc.faceEmbedding.length > 0,
      wardrobeCount: fcc.wardrobe.length,
    }
  })
}

export async function updateAppearance(
  characterId: string,
  userId: string,
  patch: Partial<CharacterAppearance>,
): Promise<FCCCharacterView> {
  const existing = await getFCCCharacter(characterId, userId)
  if (!existing) throw new Error('Character not found')
  const appearance = mergeAppearance(existing.appearance, patch)
  await db.vaultCharacter.update({
    where: { id: characterId },
    data: { appearance: appearance as never },
  })
  return { ...existing, appearance }
}

export async function patchBehavioral(
  characterId: string,
  userId: string,
  prompt: string,
): Promise<FCCCharacterView> {
  const existing = await getFCCCharacter(characterId, userId)
  if (!existing) throw new Error('Character not found')
  await db.vaultCharacter.update({
    where: { id: characterId },
    data: { behavioralPrompt: prompt },
  })
  return { ...existing, behavioralPrompt: prompt }
}

export async function saveWardrobe(
  characterId: string,
  userId: string,
  wardrobe: WardrobeItem[],
  refFront?: string,
): Promise<FCCCharacterView> {
  const existing = await getFCCCharacter(characterId, userId)
  if (!existing) throw new Error('Character not found')

  await db.$transaction([
    db.wardrobeItem.deleteMany({ where: { characterId } }),
    ...wardrobe.map((w) =>
      db.wardrobeItem.create({
        data: {
          id: w.id,
          characterId,
          region: w.region,
          prompt: w.prompt,
          refImageUrl: w.refImageUrl,
          lockedHash: w.lockedHash,
          appliedAt: new Date(w.appliedAt),
        },
      }),
    ),
    ...(refFront
      ? [
          db.vaultCharacter.update({
            where: { id: characterId },
            data: {
              referenceUrls: [
                refFront,
                existing.refProfile,
                existing.ref3Quarter,
                existing.refBack,
              ].filter((u): u is string => Boolean(u)),
            },
          }),
        ]
      : []),
  ])

  return (await getFCCCharacter(characterId, userId))!
}

export async function updateRefFront(
  characterId: string,
  userId: string,
  imageUrl: string,
): Promise<FCCCharacterView> {
  const existing = await getFCCCharacter(characterId, userId)
  if (!existing) throw new Error('Character not found')
  const refs = [imageUrl, existing.refProfile, existing.ref3Quarter, existing.refBack].filter(
    (u): u is string => Boolean(u),
  )
  await db.vaultCharacter.update({
    where: { id: characterId },
    data: { referenceUrls: refs },
  })
  return (await getFCCCharacter(characterId, userId))!
}

export async function uploadBakedPortrait(
  projectId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const key = `vault/characters/${projectId}/${nanoid()}-baked.${ext}`
  return uploadToR2(buffer, key, contentType)
}
