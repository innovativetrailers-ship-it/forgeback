import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'
import { extractVideoFrame } from '../fal/frameExtract'
import { runModel1 } from '../brain/model1'
import type { CastMember } from './types'

interface RecastParams {
  sourceVideoUrl: string
  originalCharacter: CastMember
  replacementCharacter: CastMember
  recastScope: 'face_only' | 'full_character' | 'silhouette_only'
  preserveVoice: boolean
  intensity: number
}

export class Recaster {

  async recastCharacter(params: RecastParams): Promise<string> {
    if (params.recastScope === 'face_only') {
      return this.swapFaceOnly(params)
    } else if (params.recastScope === 'full_character') {
      return this.swapFullCharacter(params)
    } else {
      return this.swapSilhouette(params)
    }
  }

  private async swapFaceOnly(params: RecastParams): Promise<string> {
    const { sourceVideoUrl, replacementCharacter, intensity } = params
    const bestReference = replacementCharacter.faceReferenceUrls[0]
    if (!bestReference) throw new Error('Replacement character has no face references')

    const frameUrl = await extractVideoFrame(sourceVideoUrl, { timestamp: 0.5 })

    const faceSwapped = await runFal(falEndpoint('face-swap-v2'), {
        source_image_url: frameUrl,
        reference_image_url: bestReference,
        strength: intensity,
      }).catch(async (err) => {
        console.warn("[caught] src/lib/casting/Recaster.ts:38", err instanceof Error ? { name: err.name, message: err.message } : err)
        return runFal(falEndpoint('flux-general/image-to-image'), {
          image_url: frameUrl,
          prompt: `Replace the face in this image with: ${replacementCharacter.baseAppearance.promptDescription}. Keep all other aspects of the image identical including body, clothes, and background.`,
          strength: intensity * 0.4,
        })
      }) as unknown as { image?: { url: string }; images?: Array<{ url: string }> }

    const swappedFrameUrl = faceSwapped.image?.url ?? faceSwapped.images?.[0]?.url

    const videoResult = await runFal(falEndpoint('seedance-v1-pro-i2v'), {
        image_url: swappedFrameUrl,
        prompt: `${replacementCharacter.baseAppearance.promptDescription}, same action and motion as original`,
        duration: 5,
      }) as unknown as { video: { url: string } }

    return videoResult.video.url
  }

  private async swapFullCharacter(params: RecastParams): Promise<string> {
    const { sourceVideoUrl, replacementCharacter } = params

    const poseResult = await runFal(falEndpoint('dwpose'), { image_url: sourceVideoUrl }) as unknown as { image_url: string }

    const recast = await runFal(falEndpoint('flux-controlnet'), {
        control_image_url: poseResult.image_url,
        prompt: `${replacementCharacter.baseAppearance.promptDescription}, same pose and action`,
        controlnet_type: 'pose',
      }) as unknown as { images: Array<{ url: string }> }

    const animated = await runFal(falEndpoint('seedance-v1-pro-i2v'), {
        image_url: recast.images[0].url,
        image_references: replacementCharacter.faceReferenceUrls.slice(0, 3),
        prompt: `${replacementCharacter.baseAppearance.promptDescription}, same motion as original video`,
        duration: 5,
      }) as unknown as { video: { url: string } }

    return animated.video.url
  }

  private async swapSilhouette(params: RecastParams): Promise<string> {
    const { sourceVideoUrl, replacementCharacter } = params

    const frameUrl = await extractVideoFrame(sourceVideoUrl, { timestamp: 0.5 })

    const restyle = await runFal(falEndpoint('flux-general/image-to-image'), {
        image_url: frameUrl,
        prompt: replacementCharacter.baseAppearance.promptDescription,
        strength: 0.55,
      }) as unknown as { images: Array<{ url: string }> }

    const result = await runFal(falEndpoint('seedance-v1-pro-i2v'), {
        image_url: restyle.images[0].url,
        prompt: replacementCharacter.baseAppearance.promptDescription,
        duration: 5,
      }) as unknown as { video: { url: string } }

    return result.video.url
  }

  async recastAcrossProject(params: {
    projectId: string
    originalCharacterId: string
    replacementCharacter: CastMember
    recastScope: 'face_only' | 'full_character'
    userId: string
  }): Promise<{ updatedClips: number; jobIds: string[] }> {
    const { db } = await import('../db')
    const { channelKey } = await import('../redis')
    const { redis } = await import('../redis')

    const affectedJobs = await db.renderJob.findMany({
      where: {
        projectId: params.projectId,
        status: 'COMPLETE',
        inputPayload: { path: ['characterIds'], array_contains: params.originalCharacterId },
      }
    })

    const jobIds: string[] = []
    for (const job of affectedJobs) {
      const recastJobId = `recast_${job.id}_${Date.now()}`
      await redis.lpush(channelKey('recast:queue'), JSON.stringify({
        id: recastJobId,
        originalJobId: job.id,
        originalVideoUrl: job.outputUrl,
        originalCharacterId: params.originalCharacterId,
        replacementCharacter: params.replacementCharacter,
        recastScope: params.recastScope,
        userId: params.userId,
      }))
      jobIds.push(recastJobId)
    }

    return { updatedClips: affectedJobs.length, jobIds }
  }
}
