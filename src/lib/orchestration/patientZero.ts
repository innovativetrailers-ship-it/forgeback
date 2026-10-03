// src/lib/orchestration/patientZero.ts
// Pre-generate character and location reference images BEFORE any video.
// These become the consistent visual anchor for all downstream generations.

import { z } from 'zod'
import { llmModelForTier } from '@cinema/core'
import { claudeCall, claudeText, AnthropicCallRefusedError } from '@/lib/llm/anthropicClient'
import { GenerationPausedError } from '@/lib/generation/pause'
import { validateLLMJson } from '@/lib/cognition/json'
import { generateImage } from '@/lib/engines/imageGen'
import { uploadToR2 } from '@/lib/storage/r2'
import type { PatientZeroAssets } from './types'

interface PatientZeroInput {
  characters: Array<{ name: string; description: string }>
  locations:  Array<{ name: string; description: string }>
}

export async function generatePatientZeroAssets(
  input: PatientZeroInput
): Promise<PatientZeroAssets> {

  const characters: PatientZeroAssets['characters'] = []
  for (const char of input.characters ?? []) {
    try {
    const [rawUrl] = await generateImage(
      `Ultra-detailed character reference sheet for film production.
Character: ${char.name}. ${char.description}.
Show: front view, 3/4 view, close-up face.
Photorealistic, consistent lighting, white background.
Film production reference quality. 8K resolution.`,
      { quality: 'production', aspectRatio: '1:1' },
    )
    if (!rawUrl) throw new Error(`Patient Zero character image failed for ${char.name}`)
    const buf    = await fetch(rawUrl).then(r => r.arrayBuffer())
    const r2Url  = await uploadToR2(
      Buffer.from(buf),
      `patient-zero/characters/${(char.name || 'character').replace(/\s/g, '_')}_${Date.now()}.jpg`,
      'image/jpeg'
    )

    characters.push({ name: char.name, imageUrl: r2Url, embedUrl: r2Url })
    } catch (err) {
      if (isGateError(err)) throw err
      console.warn('[patient-zero] character reference skipped:', err instanceof Error ? err.message : String(err))
    }
  }

  const locations: PatientZeroAssets['locations'] = []
  for (const loc of input.locations ?? []) {
    try {
    const [rawUrl] = await generateImage(
      `Cinematic location plate for film production.
Location: ${loc.name}. ${loc.description}.
Wide establishing shot, photorealistic, dramatic lighting.
Film production reference quality.`,
      { quality: 'production', aspectRatio: '16:9' },
    )
    if (!rawUrl) throw new Error(`Patient Zero location image failed for ${loc.name}`)
    const buf    = await fetch(rawUrl).then(r => r.arrayBuffer())
    const r2Url  = await uploadToR2(
      Buffer.from(buf),
      `patient-zero/locations/${(loc.name || 'location').replace(/\s/g, '_')}_${Date.now()}.jpg`,
      'image/jpeg'
    )

    locations.push({ name: loc.name, imageUrl: r2Url })
    } catch (err) {
      if (isGateError(err)) throw err
      console.warn('[patient-zero] location reference skipped:', err instanceof Error ? err.message : String(err))
    }
  }

  return { characters, locations }
}

const EMPTY_ENTITIES: PatientZeroInput = { characters: [], locations: [] }

const namedEntity = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
})

function namedList() {
  return z.array(z.unknown()).default([]).transform((items) =>
    items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as Record<string, unknown>
      const name = typeof rec.name === 'string' ? rec.name.trim() : ''
      const description = typeof rec.description === 'string' ? rec.description.trim() : ''
      const parsed = namedEntity.safeParse({ name, description })
      return parsed.success ? [parsed.data] : []
    }),
  )
}

const narrativeEntitiesSchema = z.object({
  characters: namedList(),
  locations: namedList(),
})

function isGateError(err: unknown): boolean {
  return err instanceof GenerationPausedError || err instanceof AnthropicCallRefusedError
}

async function requestNarrativeEntities(prompt: string, stricter: boolean): Promise<PatientZeroInput | null> {
  const instruction = stricter
    ? 'Your previous reply was not valid JSON. Return ONLY {"characters":[],"locations":[]}, using [] when none apply. No markdown.'
    : 'Return ONLY JSON with keys "characters" and "locations". Each item is {"name":"string","description":"string"}. Use [] when none apply. No markdown.'
  try {
    const message = await claudeCall({
      model: llmModelForTier('mechanical'),
      max_tokens: 512,
      system: 'Extract characters and locations from a video prompt. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `From this video prompt, extract named characters and distinct locations.
Prompt: "${prompt}"

${instruction}

{
  "characters": [{ "name": "string", "description": "detailed physical description" }],
  "locations": [{ "name": "string", "description": "detailed visual description" }]
}`,
      }],
    }, { source: 'preprod.patientzero', tier: 'mechanical' })
    return validateLLMJson(claudeText(message), narrativeEntitiesSchema)
  } catch (err) {
    if (isGateError(err)) throw err
    console.warn('[patient-zero] extraction call failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function extractNarrativeEntities(prompt: string): Promise<PatientZeroInput> {
  const first = await requestNarrativeEntities(prompt, false)
  if (first) return first
  const second = await requestNarrativeEntities(prompt, true)
  if (second) return second
  console.warn('[patient-zero] extraction degraded to empty characters/locations')
  return EMPTY_ENTITIES
}
