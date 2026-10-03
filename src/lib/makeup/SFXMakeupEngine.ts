import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'
import { extractVideoFrame } from '../fal/frameExtract'
import { runModel1 } from '../brain/model1'
import type { MakeupState, MakeupEffect, MakeupCategory } from '../casting/types'
import { CastManager } from '../casting/CastManager'

export class SFXMakeupEngine {
  private castManager = new CastManager()

  // Mode 1: Pre-generation — bake makeup into prompt
  injectIntoPrompt(basePrompt: string, makeupState: MakeupState): string {
    if (makeupState.effects.length === 0) return basePrompt
    const makeupDescription = this.castManager.compileMakeupPrompt(makeupState)
    return `${basePrompt}\n\nSFX makeup and appearance: ${makeupDescription}`
  }

  // Mode 2: Post-generation — apply to an already-generated video
  async applyMakeupPostGeneration(params: {
    videoUrl: string
    effects: MakeupEffect[]
    characterFaceUrl?: string
    intensity: number
  }): Promise<string> {
    const makeupState: MakeupState = {
      type: 'sfx',
      effects: params.effects,
      intensity: params.intensity,
      promptInjection: '',
    }
    makeupState.promptInjection = this.castManager.compileMakeupPrompt(makeupState)

    const frameUrl = await extractVideoFrame(params.videoUrl, { timestamp: 0.5 })

    const makeupResult = await runFal(falEndpoint('flux-general/image-to-image'), {
        image_url: frameUrl,
        prompt: `Apply realistic SFX makeup to this face/body: ${makeupState.promptInjection}. Keep everything else identical, only modify the appearance as described. Ultra-realistic, film-quality.`,
        strength: Math.min(0.35 + params.intensity * 0.3, 0.65),
        num_inference_steps: 40,
      }) as unknown as { images: Array<{ url: string }> }

    const appliedVideoResult = await runFal(falEndpoint('seedance-v1-lite-i2v'), {
        image_url: makeupResult.images[0].url,
        prompt: makeupState.promptInjection,
        duration: 5,
      }) as unknown as { video: { url: string } }

    return appliedVideoResult.video.url
  }

  // Mode 3: Reference-based makeup transfer
  async transferMakeupFromReference(params: {
    sourceVideoUrl: string
    makeupReferenceImageUrl: string
    characterFaceUrl?: string
    intensity: number
  }): Promise<string> {
    const frameUrl = await extractVideoFrame(params.sourceVideoUrl, { timestamp: 0.5 })

    const makeupDescription = await runModel1({
      systemPrompt: 'You are an expert SFX makeup artist and visual analyst. Describe the makeup or special effects visible on the face/body in this reference image in precise technical terms for a generation model. Be specific about colours, textures, locations, and intensity. Return only the description.',
      userMessage: 'Describe all makeup and SFX effects visible in this reference image.',
      images: [params.makeupReferenceImageUrl],
      requireJSON: false,
    })

    const transferred = await runFal(falEndpoint('flux-general/image-to-image'), {
        image_url: frameUrl,
        prompt: `Apply this exact makeup/SFX to this person's face: ${makeupDescription.content}. Reference image style. Film-quality, photorealistic. Keep all other features identical.`,
        strength: 0.35 + params.intensity * 0.25,
      }) as unknown as { images: Array<{ url: string }> }

    const result = await runFal(falEndpoint('seedance-v1-lite-i2v'), {
        image_url: transferred.images[0].url,
        prompt: makeupDescription.content,
        duration: 5,
      }) as unknown as { video: { url: string } }

    return result.video.url
  }

  // Mode 4: Progressive damage — escalating effects across shots
  buildProgressionStates(
    baseState: MakeupState,
    progressionSteps: number,
    progressionType: 'damage' | 'healing' | 'dirtying' | 'ageing'
  ): MakeupState[] {
    return Array.from({ length: progressionSteps }, (_, i) => {
      const progressFactor = (i + 1) / progressionSteps
      return {
        ...baseState,
        intensity: progressFactor,
        effects: baseState.effects.map(effect => ({
          ...effect,
          intensity: progressFactor * effect.intensity,
          category: progressionType === 'damage'
            ? this.escalateEffect(effect.category, progressFactor)
            : effect.category,
        })),
        promptInjection: '',
      }
    })
  }

  private escalateEffect(category: MakeupCategory, factor: number): MakeupCategory {
    if (category === 'bruise_fresh' && factor > 0.5) return 'bruise_24hr'
    if (category === 'bruise_24hr' && factor > 0.8) return 'bruise_healing'
    if (category === 'burn_first_degree' && factor > 0.6) return 'burn_second_degree'
    if (category === 'burn_second_degree' && factor > 0.8) return 'burn_third_degree'
    return category
  }

  // Natural language makeup request handler
  async handleCustomRequest(params: {
    videoUrl: string
    naturalLanguageRequest: string
    characterId?: string
    intensity?: number
  }): Promise<{ videoUrl: string; appliedEffects: MakeupEffect[] }> {
    const interpretationResponse = await runModel1({
      systemPrompt: `You are an expert SFX makeup designer. Interpret the user's request into specific makeup effects.
Return ONLY valid JSON:
{
  "effects": [
    {
      "category": "exact_category_string",
      "subcategory": "description",
      "location": "body_location_string",
      "intensity": 0.0,
      "customDescription": "optional additional detail"
    }
  ],
  "overallIntensity": 0.0,
  "artDirectorNotes": "how to approach this in generation"
}`,
      userMessage: `Request: "${params.naturalLanguageRequest}"`,
      requireJSON: true,
    })

    const interpretation = JSON.parse(interpretationResponse.content)
    const resultUrl = await this.applyMakeupPostGeneration({
      videoUrl: params.videoUrl,
      effects: interpretation.effects,
      intensity: params.intensity ?? interpretation.overallIntensity,
    })

    return { videoUrl: resultUrl, appliedEffects: interpretation.effects }
  }
}
