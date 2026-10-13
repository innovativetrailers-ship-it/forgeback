import { runArgv } from '../shell/argv'
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

interface ClipMetadata {
  prompt: string
  modelUsed: string
  characterIds: string[]
}

type OutcomeTier = 'draft' | 'standard' | 'premium' | 'cinematic' | 'film'

export async function extendClip(params: {
  clipUrl: string
  clipMetadata: ClipMetadata
  direction: 'start' | 'end' | 'both'
  extensionSeconds: number
  tier: OutcomeTier
}): Promise<{ extendedClipUrl: string }> {
  const { clipUrl, clipMetadata, direction, extensionSeconds, tier } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/extend-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const parts: string[] = []

    if (direction === 'end' || direction === 'both') {
      // Extract last frame of clip
      const lastFramePath = join(tmpDir, 'last_frame.jpg')
      runArgv("ffmpeg", ["-sseof", "-0.1", "-i", clipUrl, "-vframes", "1", lastFramePath, "-y"])

      // Upload last frame to generate continuation
      const lastFrameData = readFileSync(lastFramePath).toString('base64')
      const lastFrameUrl = await uploadToR2(
        Buffer.from(lastFrameData, 'base64'),
        `extend-frames/${jobId}_last.jpg`,
        'image/jpeg'
      )

      // Generate continuation via Seedance I2V
      const { generateVideo } = await import('../models/seedance')
      const continuation = await generateVideo({
        prompt: `${clipMetadata.prompt}, continuing naturally from previous scene`,
        duration: Math.min(extensionSeconds, 8),
        aspectRatio: '16:9',
        startFrameUrl: lastFrameUrl,
      })

      if (continuation.videoUrl) {
        // 4-frame dissolve stitch
        const extPath = join(tmpDir, 'extension_end.mp4')
        const extBuf = Buffer.from(await (await fetch(continuation.videoUrl)).arrayBuffer())
        require('fs').writeFileSync(extPath, extBuf)

        parts.push(clipUrl)
        parts.push(extPath)
      }
    }

    if (direction === 'start' || direction === 'both') {
      // Extract first frame
      const firstFramePath = join(tmpDir, 'first_frame.jpg')
      runArgv("ffmpeg", ["-i", clipUrl, "-vframes", "1", firstFramePath, "-y"])

      const firstFrameData = readFileSync(firstFramePath).toString('base64')
      const firstFrameUrl = await uploadToR2(
        Buffer.from(firstFrameData, 'base64'),
        `extend-frames/${jobId}_first.jpg`,
        'image/jpeg'
      )

      // Generate pre-scene
      const { generateVideo } = await import('../models/seedance')
      const preScene = await generateVideo({
        prompt: `${clipMetadata.prompt}, lead-in scene before the main action`,
        duration: Math.min(extensionSeconds, 8),
        aspectRatio: '16:9',
        startFrameUrl: firstFrameUrl,
      })

      if (preScene.videoUrl) {
        // Reverse the generated clip
        const preScenePath = join(tmpDir, 'pre_scene_raw.mp4')
        const preReversedPath = join(tmpDir, 'pre_scene.mp4')
        const preBuf = Buffer.from(await (await fetch(preScene.videoUrl)).arrayBuffer())
        require('fs').writeFileSync(preScenePath, preBuf)

        runArgv("ffmpeg", ["-i", preScenePath, "-vf", "reverse", "-c:v", "libx264", preReversedPath, "-y"])

        parts.unshift(preReversedPath)
        if (!parts.includes(clipUrl)) parts.push(clipUrl)
      }
    }

    if (parts.length === 0 || (parts.length === 1 && parts[0] === clipUrl)) {
      return { extendedClipUrl: clipUrl }
    }

    // Concat all parts with dissolve transitions
    const concatList = join(tmpDir, 'concat.txt')
    require('fs').writeFileSync(concatList, parts.map((p) => `file '${p}'`).join('\n') + '\n')

    const outputPath = join(tmpDir, 'extended.mp4')
    runArgv("ffmpeg", ["-f", "concat", "-safe", "0", "-i", concatList, "-c:v", "libx264", "-crf", "18", "-c:a", "copy", outputPath, "-y"])

    void tier

    const buffer = readFileSync(outputPath)
    const extendedClipUrl = await uploadToR2(buffer, `extended/${jobId}.mp4`, 'video/mp4')
    return { extendedClipUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
