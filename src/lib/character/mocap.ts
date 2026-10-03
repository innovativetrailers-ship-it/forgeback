import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falQueueBound} from '@/lib/fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
const falQueueOps = falQueueBound('lib.character.mocap')
import {
  buildMocapPrompt,
  clampMocapStrength,
  type MocapDrawMode,
  type MocapResolution,
} from './characterMotion'

const HUNYUAN_V2V_ENDPOINT = falEndpoint('hunyuan-video/video-to-video')

/**
 * VIDEO-FAMILY shot payloads are built only by buildPayload.
 * TOOL endpoints are not video families. Each one has its own typed builder.
 */
export const TOOL_ENDPOINTS = [falEndpoint('dwpose/video')]
export const VIDEO_PAYLOAD_BUILDER = 'buildPayload'

export interface DWPosePayload {
  video_url: string
  draw_mode: MocapDrawMode
}

export function buildPoseExtractionInput(input: {
  videoUrl: string
  drawMode: MocapDrawMode
}): DWPosePayload {
  const videoUrl = input.videoUrl.trim()
  if (!videoUrl) throw new Error('Pose extraction requires a video URL.')
  return { video_url: videoUrl, draw_mode: input.drawMode }
}

function extractVideoUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const video = d.video as { url?: string } | undefined
  if (video?.url) return video.url
  if (typeof d.video_url === 'string') return d.video_url
  if (typeof d.pose_video_url === 'string') return d.pose_video_url
  if (typeof d.url === 'string') return d.url
  return null
}

async function pollFal(endpoint: string, requestId: string): Promise<unknown> {
  const deadline = Date.now() + 20 * 60 * 1000
  for (;;) {
    if (Date.now() > deadline) throw new Error('Motion capture timed out.')
    await new Promise((r) => setTimeout(r, 3000))
    const status = (await falQueueOps.status(endpoint, { requestId, logs: false })) as { status: string }
    if (status.status === 'COMPLETED') break
    if (status.status === 'FAILED') throw new Error('Motion capture failed.')
  }
  const result = (await falQueueOps.result(endpoint, { requestId })) as { data: unknown }
  return result.data
}

async function submitAndPoll(endpoint: string, input: Record<string, unknown>): Promise<unknown> {
  const submitted = (await falQueueOps.submit(endpoint, { input })) as { request_id: string }
  return pollFal(endpoint, submitted.request_id)
}

export async function extractPoseVideo(motionVideoUrl: string, drawMode: MocapDrawMode): Promise<string> {
  const pose = buildPoseExtractionInput({ videoUrl: motionVideoUrl, drawMode })
  const data = await submitAndPoll(TOOL_ENDPOINTS[0], { ...pose })
  const poseUrl = extractVideoUrl(data)
  if (!poseUrl) throw new Error('DWPose returned no pose video.')
  return poseUrl
}

export async function animatePortraitWithMotion(
  portraitUrl: string,
  motionVideoUrl: string,
  opts: {
    drawMode?: MocapDrawMode
    resolution?: MocapResolution
    strength?: number
    prompt?: string
    portraitLabel?: string
  } = {},
): Promise<string> {
  const drawMode: MocapDrawMode = opts.drawMode ?? 'body-pose'
  const resolution: MocapResolution = opts.resolution ?? '720p'
  const strength = clampMocapStrength(opts.strength)
  const prompt = buildMocapPrompt(opts.portraitLabel ?? 'character', opts.prompt)

  const poseVideoUrl = await extractPoseVideo(motionVideoUrl, drawMode)
  const built = await buildPayload(HUNYUAN_V2V_ENDPOINT, 'hunyuan', {
    prompt,
    duration: 5,
    imageUrl: portraitUrl,
    extraFields: {
      video_url: poseVideoUrl,
      resolution,
      strength,
      enable_safety_checker: true,
      image_url: portraitUrl,
    },
  })
  const animData = await submitAndPoll(HUNYUAN_V2V_ENDPOINT, built)

  const outUrl = extractVideoUrl(animData)
  if (!outUrl) throw new Error('Hunyuan motion transfer returned no video.')
  return outUrl
}
