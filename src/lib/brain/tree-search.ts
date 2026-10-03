import { logCaught } from '@/lib/diagnostics/caught'
import { runModel1 } from './model1'
import { db } from '../db'
import { nanoid } from 'nanoid'
import type { TimelineRecipe, Track } from '../timeline/schema'
import type { VaultCharacter } from '@/generated/prisma/client'

interface FilmPlan {
  title: string
  logline: string
  scenes: Array<{
    order: number
    description: string
    shotType: string
    duration: number
    modelSuggested: string
    prompt: string
    characterIds?: string[]
  }>
  narrativeScore: number
  pacingScore: number
  characterArcScore: number
  totalScore: number
}

export async function treeSearchFilmPlan(params: {
  brief: string
  characters: Pick<VaultCharacter, 'id' | 'name' | 'modelFamily'>[]
  targetDuration: number
  numBranches?: number
  depthLimit?: number
  userId?: string
}): Promise<TimelineRecipe> {
  const { brief, characters, targetDuration, numBranches = 3, userId } = params

  // 1. Generate N alternative film plans in parallel
  const planPromises = Array.from({ length: numBranches }, async (_, i) => {
    const result = await runModel1({
      systemPrompt: `You are a master film director creating a ${targetDuration}-second film plan.
Approach ${i + 1}: ${i === 0 ? 'Classic linear narrative' : i === 1 ? 'Non-linear / fragmented structure' : 'Experimental / visual poetry'}

Return ONLY valid JSON matching the FilmPlan schema.`,
      userMessage: `Brief: ${brief}
Characters: ${characters.map((c) => c.name).join(', ') || 'none'}
Target duration: ${targetDuration}s

FilmPlan schema:
{
  "title": string,
  "logline": string,
  "scenes": [{ "order": number, "description": string, "shotType": string, "duration": number, "modelSuggested": string, "prompt": string }],
  "narrativeScore": 0-10,
  "pacingScore": 0-10,
  "characterArcScore": 0-10,
  "totalScore": 0-10
}`,
      requireJSON: true,
    })

    try {
      return JSON.parse(result.content) as FilmPlan
    } catch (err) {
      console.warn("[caught] src/lib/brain/tree-search.ts:62", err instanceof Error ? { name: err.name, message: err.message } : err)

      return null
    }
  })

  const allPlans = (await Promise.all(planPromises)).filter(Boolean) as FilmPlan[]

  if (allPlans.length === 0) {
    throw new Error('Tree search failed to generate any valid film plans')
  }

  // 2. Score each plan and select the highest
  const bestPlan = allPlans.reduce((best, plan) => {
    const score = plan.totalScore ?? (plan.narrativeScore + plan.pacingScore + plan.characterArcScore) / 3
    const bestScore = best.totalScore ?? (best.narrativeScore + best.pacingScore + best.characterArcScore) / 3
    return score > bestScore ? plan : best
  })

  // 3. Log all branches as training data (rejected = negative examples)
  if (userId) {
    const rejectedPlans = allPlans.filter((p) => p !== bestPlan)
    db.trainingData.create({
      data: {
        userId,
        type: 'routing_decision',
        instruction: `Tree search for: ${brief}`,
        metadata: {
          bestPlan,
          rejectedPlans,
          numBranches,
          targetDuration,
        } as never,
        isProcessed: false,
      },
    }).catch((err) => logCaught('lib/brain/tree-search', err))
  }

  // 4. Convert best plan to TimelineRecipe
  const recipeId = nanoid()
  const videoTrack: Track = {
    id: `track-video-${nanoid()}`,
    type: 'video',
    label: 'VIDEO 1',
    muted: false,
    locked: false,
    solo: false,
    clips: [],
  }

  let currentTime = 0
  for (const scene of bestPlan.scenes.sort((a, b) => a.order - b.order)) {
    videoTrack.clips.push({
      id: `clip-${nanoid()}`,
      trackId: videoTrack.id,
      startTime: currentTime,
      endTime: currentTime + scene.duration,
      sourceUrl: '',
      modelUsed: scene.modelSuggested,
      prompt: scene.prompt,
      metadata: { description: scene.description, shotType: scene.shotType },
    })
    currentTime += scene.duration
  }

  const recipe: TimelineRecipe = {
    id: recipeId,
    projectId: '',
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: currentTime,
    colorSpace: 'rec709',
    tracks: [videoTrack],
  }

  return recipe
}
