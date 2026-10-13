import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.avatar.AvatarEngine')
import { uploadToR2 } from '../storage/r2'
import { db } from '../db'
import { cloneVoice, synthesiseSpeech } from '../audio/elevenlabs'

export async function createInstantAvatar(params: {
  recordingUrl: string
  userId: string
  name: string
}): Promise<{ avatarId: string; previewUrl: string }> {
  const { recordingUrl, userId, name } = params

  // Extract face thumbnail
  const { mkdirSync, rmSync, existsSync, readFileSync } = await import('fs')
  const { join } = await import('path')
  const { nanoid } = await import('nanoid')

  const jobId = nanoid()
  const tmpDir = `/tmp/avatar-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  let thumbnailUrl: string
  let voiceId: string | null = null

  try {
    // Extract a good face frame
    const thumbPath = join(tmpDir, 'thumb.jpg')
    const { runArgv } = await import('../shell/argv')
    runArgv('ffmpeg', ['-i', recordingUrl, '-vframes', '1', '-ss', '00:00:02', thumbPath, '-y'])
    const thumbBuf = readFileSync(thumbPath)
    thumbnailUrl = await uploadToR2(thumbBuf, `avatars/${jobId}_thumb.jpg`, 'image/jpeg')

    // Clone voice from recording
    try {
      const cloneResult = await cloneVoice({
        name,
        audioSamples: [recordingUrl],
      })
      voiceId = cloneResult.voiceId
    } catch (err) {
      console.warn("[caught] src/lib/avatar/AvatarEngine.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Voice cloning optional
    }

    const avatar = await db.avatar.create({
      data: {
        userId,
        name,
        type: 'instant',
        videoUrl: recordingUrl,
        thumbnailUrl,
        voiceId,
      },
    })

    return { avatarId: avatar.id, previewUrl: thumbnailUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function scriptToAvatarVideo(params: {
  script: string
  avatarId: string
  voiceSettings?: { pitch: number; speed: number; emotion: string }
  backgroundUrl?: string
  duration?: number
}): Promise<{ videoUrl: string }> {
  const { script, avatarId, voiceSettings, backgroundUrl } = params

  const avatar = await db.avatar.findUnique({ where: { id: avatarId } })
  if (!avatar) throw new Error('Avatar not found')

  // Generate TTS audio from script
  const { audioUrl } = await synthesiseSpeech({
    text: script,
    voiceId: avatar.voiceId ?? 'EXAVITQu4vr4xnSDxMaL', // default voice
    emotion: (voiceSettings?.emotion as 'neutral' | 'excited' | 'sad' | 'angry' | 'whispering') ?? 'neutral',
  })

  // Drive the avatar with SadTalker + LivePortrait
  const sadTalkerResult = await falSubscribe(falEndpoint('sadtalker'), {
    input: {
      source_image_url: avatar.thumbnailUrl,
      driven_audio_url: audioUrl,
      expression_scale: 1.2,
    },
  }) as unknown as { video: { url: string } }

  let videoUrl = sadTalkerResult.video.url

  // Composite over background
  if (backgroundUrl) {
    const { runArgv } = await import('../shell/argv')
    const { mkdirSync, rmSync, existsSync, readFileSync } = await import('fs')
    const { join } = await import('path')
    const { nanoid } = await import('nanoid')
    const jobId = nanoid()
    const tmpDir = `/tmp/avatar-comp-${jobId}`
    mkdirSync(tmpDir, { recursive: true })

    try {
      const avatarBuf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer())
      const avatarPath = join(tmpDir, 'avatar.mp4')
      require('fs').writeFileSync(avatarPath, avatarBuf)
      const outputPath = join(tmpDir, 'composited.mp4')

      runArgv('ffmpeg', ['-i', backgroundUrl, '-i', avatarPath, '-filter_complex', '[0:v][1:v]overlay=x=(W-w)/2:y=(H-h)/2', '-c:a', 'copy', outputPath, '-y'])

      const outBuf = readFileSync(outputPath)
      videoUrl = await uploadToR2(outBuf, `avatar-videos/${jobId}.mp4`, 'video/mp4')
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  return { videoUrl }
}

export async function talkingPhoto(params: {
  photoUrl: string
  audioUrl: string
}): Promise<{ videoUrl: string }> {
  const { photoUrl, audioUrl } = params

  const result = await falSubscribe(falEndpoint('sadtalker'), {
    input: {
      source_image_url: photoUrl,
      driven_audio_url: audioUrl,
      expression_scale: 1.0,
    },
  }) as unknown as { video: { url: string } }

  return { videoUrl: result.video.url }
}
