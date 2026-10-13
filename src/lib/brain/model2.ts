// Model 2 — Mochi-1 video generation model used for internal quality evaluation
// and training signal generation. Not user-facing.

import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.brain.model2')

export interface Model2Input {
  prompt: string
  duration?: number
  referenceVideoUrl?: string
  seed?: number
}

export interface Model2Output {
  videoUrl: string
  generationMs: number
  qualityScore?: number
}

export async function runModel2(input: Model2Input): Promise<Model2Output> {
  const start = Date.now()

  const result = await falSubscribe(falEndpoint('mochi-v1'), {
    input: {
      prompt: input.prompt,
      seed: input.seed,
    },
  }) as { data: { video?: { url: string } } }

  const videoUrl = result.data.video?.url ?? ''
  if (!videoUrl) throw new Error('Model 2 (Mochi-1) returned no video URL')

  return {
    videoUrl,
    generationMs: Date.now() - start,
  }
}

// Evaluate video quality using Model 1 (vision)
export async function evaluateQuality(
  videoUrl: string,
  prompt: string
): Promise<{ score: number; issues: string[]; strengths: string[] }> {
  const { runModel1 } = await import('./model1')

  const result = await runModel1({
    systemPrompt: `You are a video quality evaluator for a professional AI film platform.
Analyse the video described by its prompt and return a JSON object:
{
  "score": <0-1 float — overall cinematic quality>,
  "issues": ["list of specific quality problems"],
  "strengths": ["list of specific strengths"]
}
Be concise. Score 0.8+ means production-ready. Score below 0.5 means needs repaint.`,
    userMessage: `Prompt: "${prompt}"\nVideo URL: ${videoUrl}`,
    requireJSON: true,
    images: [videoUrl],
  })

  try {
    return JSON.parse(result.content) as { score: number; issues: string[]; strengths: string[] }
  } catch (err) {
    console.warn("[caught] src/lib/brain/model2.ts:62", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { score: 0.7, issues: [], strengths: ['Unable to evaluate'] }
  }
}
