import { db } from '@/lib/db'
import { buildIdentityTokens, injectCharacterTokens } from './identityLock'
import { matchCharacterForShot } from './characterResolve'
import { vaultToFCC } from './fccManager'
import type { FCCCharacter } from './fccSchema'

export interface CharacterCognitionContext {
  id: string
  name: string
  behavioralPrompt: string
  wardrobeSummary: string
  appearanceSummary: string
}

export async function resolveMatchedVaultCharacter(
  userId: string,
  projectId: string | undefined,
  prompt: string,
  description = '',
  consistencyId: string | null = null,
): Promise<FCCCharacter | null> {
  const pid = projectId ?? 'global'
  const rows = await db.vaultCharacter.findMany({
    where: { projectId: pid, project: { userId } },
    include: { wardrobe: true },
  })
  if (rows.length === 0) return null
  return matchCharacterForShot(rows.map(vaultToFCC), description, prompt, consistencyId)
}

export function toCognitionContext(char: FCCCharacter): CharacterCognitionContext {
  const tokens = buildIdentityTokens(char)
  return {
    id: char.id,
    name: char.name,
    behavioralPrompt: char.behavioralPrompt,
    wardrobeSummary: tokens.wardrobePrompt,
    appearanceSummary: tokens.modificationPrompt,
  }
}

export async function enrichGeneratePayload(
  userId: string,
  projectId: string | undefined,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  const description = typeof payload.description === 'string' ? payload.description : ''
  const consistencyId =
    typeof payload.consistencyId === 'string'
      ? payload.consistencyId
      : typeof payload.characterId === 'string'
        ? payload.characterId
        : null

  const match = await resolveMatchedVaultCharacter(userId, projectId, prompt, description, consistencyId)
  if (!match || !match.refFront) return payload

  const tokens = buildIdentityTokens({
    refFront: match.refFront,
    ref3Quarter: match.ref3Quarter,
    loraWeightsRef: match.loraWeightsRef,
    appearance: match.appearance,
    wardrobe: match.wardrobe,
  })

  const enriched = injectCharacterTokens(
    { ...payload, prompt: prompt || description },
    tokens,
  )

  const refs = Array.isArray(payload.characterRefs) ? payload.characterRefs : []
  enriched.characterRefs = [...new Set([...refs, match.refFront, match.ref3Quarter].filter(Boolean))]
  if (match.loraWeightsRef) enriched.loraId = match.loraWeightsRef
  if (match.behavioralPrompt) {
    enriched.prompt = `${enriched.prompt}, ${match.behavioralPrompt}`
  }

  enriched.fccCognitionContext = toCognitionContext(match)
  return enriched
}
