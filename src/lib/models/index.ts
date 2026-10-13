/**
 * Swarm-compatible model dispatch barrel.
 * All exported generate* functions block until the video URL is available.
 */
import { fal } from '../fal/client'
import { generateSkyReels } from './skyreels'
import { generateLTX } from './ltx'
export { generateSkyReels, generateLTX }

export interface SwarmPayload {
  prompt: string
  negativePrompt?: string
  duration: number
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9'
  characterRefs?: string[]
  seed?: number
  startFrameUrl?: string
}

// ── Poll helpers ─────────────────────────────────────────────
async function pollUntilDone<T>(
  poll: () => Promise<{ status: string; result?: T }>,
  intervalMs: number,
  maxAttempts: number,
  name: string
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { status, result } = await poll()
    if (status === 'complete' && result !== undefined) return result
    if (status === 'failed') throw new Error(`${name} generation failed`)
  }
  throw new Error(`${name} timeout after ${(intervalMs * maxAttempts) / 1000}s`)
}

// ── Seedance 2.0 ─────────────────────────────────────────────
import * as seedanceClient from './seedance'
export async function generateSeedance20(payload: SwarmPayload): Promise<string> {
  const job = await seedanceClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  return pollUntilDone(
    async () => {
      const r = await seedanceClient.pollStatus(job.jobId)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 120, 'Seedance'
  )
}

// ── Veo 3.1 ──────────────────────────────────────────────────
import * as veo3Client from './veo3'
export async function generateVeo3(payload: SwarmPayload): Promise<string> {
  const job = await veo3Client.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  return pollUntilDone(
    async () => {
      const r = await veo3Client.pollStatus(job.jobId)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    10000, 60, 'Veo3'
  )
}

// ── Kling 3.0 ────────────────────────────────────────────────
import * as klingClient from './kling'
export async function generateKling30(payload: SwarmPayload): Promise<string> {
  const job = await klingClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
    characterRefs: payload.characterRefs,
  }, 'pro')
  const isI2V = !!payload.startFrameUrl
  return pollUntilDone(
    async () => {
      const r = await klingClient.pollStatus(job.jobId, 'pro', isI2V, job.pollUrl)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 120, 'Kling'
  )
}

// ── Runway Gen-4.5 ───────────────────────────────────────────
import * as runwayClient from '@/lib/providers/runway'
export async function generateRunway(payload: SwarmPayload): Promise<string> {
  const job = await runwayClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: Math.min(payload.duration, 16),
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  return pollUntilDone(
    async () => {
      const r = await runwayClient.pollStatus(job.jobId)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 120, 'Runway'
  )
}


// ── HunyuanVideo 1.5 ─────────────────────────────────────────
import * as hunyuanClient from './hunyuan'
export async function generateHunyuan(payload: SwarmPayload): Promise<string> {
  const job = await hunyuanClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  return pollUntilDone(
    async () => {
      const r = await hunyuanClient.pollStatus(job.jobId, !!payload.startFrameUrl, job.pollUrl)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    8000, 90, 'HunyuanVideo'
  )
}

// ── Wan 2.6 ──────────────────────────────────────────────────
export async function generateWan22(payload: SwarmPayload): Promise<string> {
  const { generateVideoSync } = await import('./wan')
  return generateVideoSync({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
    seed: payload.seed,
  })
}

// ── LTX-2.3 ──────────────────────────────────────────────────
export async function generateLTXSwarm(payload: SwarmPayload): Promise<string> {
  return generateLTX({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    seed: payload.seed,
    registryKey: 'ltx-2.3-fast',
  })
}

// ── Pika 2.2 ─────────────────────────────────────────────────
import * as pikaClient from './pika'
export async function generatePika(payload: SwarmPayload): Promise<string> {
  const job = await pikaClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: Math.min(payload.duration, 10),
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  if (job.status === 'complete' && job.videoUrl) return job.videoUrl
  if (job.status === 'failed') throw new Error(job.error ?? 'Pika failed')
  
  return pollUntilDone(
    async () => {
      const r = await pikaClient.pollStatus(job.jobId)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 120, 'Pika'
  )
}

// ── Minimax / Hailuo ─────────────────────────────────────────
import * as minimaxClient from './minimax'
export async function generateMinimax(payload: SwarmPayload): Promise<string> {
  const job = await minimaxClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: Math.min(payload.duration, 360),
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  })
  return pollUntilDone(
    async () => {
      const r = await minimaxClient.pollStatus(job.jobId)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 240, 'Minimax'
  )
}

// ── SkyReels V1 ──────────────────────────────────────────────
export async function generateSkyReelsSwarm(payload: SwarmPayload): Promise<string> {
  return generateSkyReels({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    characterRefs: payload.characterRefs,
    seed: payload.seed,
  })
}

// ── Pixverse ─────────────────────────────────────────────────
import * as pixverseClient from './pixverse'
export async function generatePixverse(
  payload: SwarmPayload,
  registryKey: pixverseClient.PixverseRegistryKey = 'pixverse-v6',
): Promise<string> {
  const isI2V = Boolean(payload.startFrameUrl)
  const job = await pixverseClient.generateVideo({
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt,
    duration: Math.min(payload.duration, 10),
    aspectRatio: payload.aspectRatio,
    startFrameUrl: payload.startFrameUrl,
  }, registryKey)
  if (job.status === 'complete' && job.videoUrl) return job.videoUrl
  if (job.status === 'failed') throw new Error(job.error ?? 'Pixverse failed')

  return pollUntilDone(
    async () => {
      const r = await pixverseClient.pollStatus(job.jobId, registryKey, isI2V, job.pollUrl)
      return { status: r.status === 'complete' ? 'complete' : r.status === 'failed' ? 'failed' : 'pending', result: r.videoUrl }
    },
    5000, 120, 'Pixverse'
  )
}

// ── Mochi-1 (fal) ────────────────────────────────────────────────────────────
export async function generateMochi(payload: SwarmPayload): Promise<string> {
  const { runModel2 } = await import('../brain/model2')
  const out = await runModel2({
    prompt: payload.prompt,
    duration: payload.duration,
    seed: payload.seed,
  })
  return out.videoUrl
}
