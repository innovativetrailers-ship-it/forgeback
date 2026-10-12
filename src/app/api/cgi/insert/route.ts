import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runFal } from '@/lib/fal/client'
import { extractDepthMap } from '@/lib/fal/enhancement'
import { matchLocationLighting } from '@/lib/fal/lighting'
import { checkAndDeductCredits } from '@/lib/credits'
import { uploadToR2 } from '@/lib/storage/r2'
import ffmpeg from 'fluent-ffmpeg'
import { mkdirSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import https from 'https'
import http from 'http'
import { pipeline } from 'stream/promises'
import { createWriteStream, readFileSync } from 'fs'
import { nanoid } from 'nanoid'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  videoUrl: z.string().url(),
  prompt: z.string().min(3),
  insertionTimestamps: z.tuple([z.number(), z.number()]),
  depthMatchFrame: z.string().url().optional(),
})

async function downloadFile(url: string, dest: string): Promise<void> {
  const protocol = url.startsWith('https') ? https : http
  await new Promise<void>((resolve, reject) => {
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      pipeline(res, createWriteStream(dest)).then(resolve).catch((err) => {
        console.warn("[caught] src/app/api/cgi/insert/route.ts:30", err instanceof Error ? { name: err.name, message: err.message } : err)
        reject(err)
      })
    }).on('error', reject)
  })
}

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { videoUrl, prompt, insertionTimestamps, depthMatchFrame } = parsed.data
  const [insertStart, insertEnd] = insertionTimestamps
  const insertDuration = insertEnd - insertStart

  try {
    await checkAndDeductCredits(userId, 'cgi_generate_3d')
  } catch (err) {
    console.warn("[caught] src/app/api/cgi/insert/route.ts:49", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  const tempDir = path.join(tmpdir(), `cinema_cgi_${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  const inputPath = path.join(tempDir, 'source.mp4')
  const framePath = path.join(tempDir, 'frame.jpg')
  const segmentAPath = path.join(tempDir, 'seg_a.mp4')
  const compositePath = path.join(tempDir, 'composite.mp4')
  const segmentBPath = path.join(tempDir, 'seg_b.mp4')
  const outputPath = path.join(tempDir, 'output.mp4')

  await downloadFile(videoUrl, inputPath)

  // ── 1. Extract reference frame at insertion point ─────────────────────
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(insertStart)
      .frames(1)
      .output(framePath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })

  const frameToAnalyse = depthMatchFrame ?? `data:image/jpeg;base64,${readFileSync(framePath).toString('base64')}`

  // ── 2. Generate 3D object via TripoSG ─────────────────────────────────
  interface TripoResult {
    model_mesh?: { url: string }
    video?: { url: string }
  }

  const tripoResult = await runFal<TripoResult>(falEndpoint('triposg'), { prompt })

  // ── 3. Extract depth map and match lighting ────────────────────────────
  const [depthResult, lightResult] = await Promise.allSettled([
    extractDepthMap(frameToAnalyse),
    matchLocationLighting(frameToAnalyse, frameToAnalyse),
  ])

  const depthUrl = depthResult.status === 'fulfilled' ? depthResult.value.depthUrl : null
  const relitUrl = lightResult.status === 'fulfilled' ? lightResult.value.relitUrl : null

  // ── 4. Generate composited CGI video via video-to-video with 3D reference ─
  interface CompResult {
    video?: { url: string }
  }

  const compResult = await runFal<CompResult>(falEndpoint('kling-video/v1.5/pro/image-to-video'), {
    image_url: relitUrl ?? frameToAnalyse,
    prompt: `${prompt}, photorealistic CGI composite, depth-aware, matched lighting`,
    duration: (Math.min(Math.ceil(insertDuration), 5) <= 5 ? '5' : '10') as '5' | '10',
  })

  const compositeVideoUrl = compResult.video?.url ?? tripoResult.model_mesh?.url

  if (!compositeVideoUrl) {
    return NextResponse.json({ error: 'CGI generation returned no output' }, { status: 500 })
  }

  await downloadFile(compositeVideoUrl, compositePath)

  // ── 5. Splice composite into original using FFmpeg concat ──────────────
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath).setStartTime(0).duration(insertStart).output(segmentAPath).on('end', () => resolve()).on('error', (e: Error) => reject(e)).run()
  })

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath).setStartTime(insertEnd).output(segmentBPath).on('end', () => resolve()).on('error', (e: Error) => reject(e)).run()
  })

  // Concat: segA + composite + segB
  const concatList = `${segmentAPath}\n${compositePath}\n${segmentBPath}`
  const concatFile = path.join(tempDir, 'concat.txt')
  const { writeFileSync } = await import('fs')
  writeFileSync(concatFile, concatList.split('\n').map((f) => `file '${f}'`).join('\n'))

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOption('-f', 'concat')
      .inputOption('-safe', '0')
      .videoCodec('libx264')
      .outputOption('-crf', '18')
      .audioCodec('copy')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (e: Error) => reject(e))
      .run()
  })

  // Upload result
  const outputBuffer = readFileSync(outputPath)
  const key = `cgi/${nanoid()}.mp4`
  const outputUrl = await uploadToR2(outputBuffer, key, 'video/mp4')

  // Cleanup
  for (const f of [inputPath, framePath, segmentAPath, compositePath, segmentBPath, outputPath, concatFile]) {
    try { unlinkSync(f) } catch (err) {
      console.warn("[caught] src/app/api/cgi/insert/route.ts:150", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
  }

  return NextResponse.json({
    outputUrl,
    depthMapUrl: depthUrl,
    relitFrameUrl: relitUrl,
  })
}
