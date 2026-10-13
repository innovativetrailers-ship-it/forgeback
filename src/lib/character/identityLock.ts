// V2 — shared three-lock identity helpers (mirrors V3 desktop).

import type { CharacterAppearance, WardrobeItem } from './fccSchema'

export interface IdentityTokens {
  faceReferenceUrl: string
  bodyReferenceUrl: string
  loraWeightsUrl?: string
  modificationPrompt: string
  wardrobePrompt: string
}

export interface FCCLike {
  refFront: string
  ref3Quarter?: string
  loraWeightsRef?: string
  appearance: CharacterAppearance
  wardrobe: WardrobeItem[]
}

export function buildModificationPrompt(a: CharacterAppearance): string {
  const parts: string[] = []
  if (a.structuralAge < 25) parts.push(`young, approximately ${a.structuralAge} years old`)
  if (a.structuralAge > 55) parts.push(`aged ${a.structuralAge} years, visible aging`)
  if (a.muscularityPct > 70) parts.push('highly muscular, athletic physique')
  if (a.bodyFatIndex < 10) parts.push('very lean, low body fat')
  if (a.hairLength < 10) parts.push('shaved head')
  if (a.hairLength > 400) parts.push('very long hair')
  return parts.join(', ')
}

export function buildIdentityTokens(character: FCCLike): IdentityTokens {
  return {
    faceReferenceUrl: character.refFront,
    bodyReferenceUrl: character.ref3Quarter ?? character.refFront,
    loraWeightsUrl: character.loraWeightsRef,
    modificationPrompt: buildModificationPrompt(character.appearance),
    wardrobePrompt: character.wardrobe
      .filter((w): w is WardrobeItem => Boolean(w) && typeof w.prompt === 'string')
      .map((w) => `${w.region}: ${w.prompt}`)
      .join(', '),
  }
}

export function injectCharacterTokens(
  baseInput: Record<string, unknown>,
  tokens: IdentityTokens,
): Record<string, unknown> {
  const input = { ...baseInput }
  if (tokens.faceReferenceUrl) {
    input.image_url = tokens.faceReferenceUrl
    input.startFrameUrl = tokens.faceReferenceUrl
    input.face_image_url = tokens.faceReferenceUrl
    input.reference_image_url = tokens.bodyReferenceUrl
  }
  const promptParts = [input.prompt, tokens.modificationPrompt, tokens.wardrobePrompt].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  )
  if (promptParts.length > 0) input.prompt = promptParts.join(', ')
  if (tokens.loraWeightsUrl) {
    input.loras = [{ path: tokens.loraWeightsUrl, scale: 0.85 }]
  }
  return input
}
