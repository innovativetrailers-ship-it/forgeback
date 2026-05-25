import { db } from '../db'
import { uploadToR2 } from '../storage/r2'
import { extractFaceEmbedding, extractCharacterFeatures } from '../fal/character'
import { nanoid } from 'nanoid'

export interface CreateCharacterInput {
  projectId: string
  name: string
  imageBuffers: Array<{ buffer: Buffer; filename: string; contentType: string }>
}

export async function createCharacter(input: CreateCharacterInput) {
  const { projectId, name, imageBuffers } = input

  // Upload all reference images to R2
  const referenceUrls = await Promise.all(
    imageBuffers.map(async ({ buffer, filename, contentType }) => {
      const ext = filename.split('.').pop() ?? 'jpg'
      const key = `vault/characters/${projectId}/${nanoid()}.${ext}`
      return uploadToR2(buffer, key, contentType)
    })
  )

  // Extract face embedding from first image
  const embedding = referenceUrls.length > 0
    ? await extractFaceEmbedding(referenceUrls[0])
    : { embedding: [] }

  const character = await db.vaultCharacter.create({
    data: {
      projectId,
      name,
      referenceUrls,
      faceEmbedding: embedding.embedding.length > 0
        ? JSON.parse(JSON.stringify(embedding))
        : undefined,
    },
  })

  // Kick off feature extraction async (don't await — non-blocking)
  if (referenceUrls.length > 0) {
    extractCharacterFeatures(referenceUrls).then((features) => {
      db.vaultCharacter.update({
        where: { id: character.id },
        data: {
          styleJson: JSON.parse(JSON.stringify(features)) as never,
        },
      }).catch(console.error)
    }).catch(console.error)
  }

  return character
}

export async function getCharacter(id: string) {
  return db.vaultCharacter.findUnique({ where: { id } })
}

export async function listCharacters(projectId?: string, userId?: string) {
  return db.vaultCharacter.findMany({
    where: projectId
      ? { projectId }
      : userId
        ? { project: { userId } }
        : {},
    orderBy: { renderCount: 'desc' },
  })
}

export async function deleteCharacter(id: string) {
  return db.vaultCharacter.delete({ where: { id } })
}
