import { llmCall } from '@/lib/llm/anthropicClient'
import { isGenerationPausedError } from '@/lib/generation/pause'

export interface QualityReport {
  score: number
  passed: boolean
  issues: string[]
  repaintRecommended: boolean
  repaintRegions: Array<{ description: string; severity: number }>
}

export async function inspectGeneratedClip(params: {
  videoUrl: string
  originalPrompt: string
  engineId: string
}): Promise<QualityReport> {
  const frameUrl = await extractMiddleFrame(params.videoUrl)

  try {
    const response = await llmCall({
      model: 'google/gemini-1.5-pro',
      maxTokens: 500,
      source: 'quality.inspect',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: frameUrl } },
            {
              type: 'text',
              text: `Rate this video frame for the prompt: "${params.originalPrompt}". Return JSON only: { "score": 0-10, "issues": string[], "repaintRecommended": boolean }`,
            },
          ],
        },
      ],
    })

    const raw = response.content
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0]) as {
      score?: number
      issues?: string[]
      repaintRecommended?: boolean
    }

    const score = typeof result.score === 'number' ? result.score : 7
    return {
      score,
      passed: score >= 6.0,
      issues: result.issues ?? [],
      repaintRecommended: result.repaintRecommended ?? false,
      repaintRegions: [],
    }
  } catch (err) {
    if (isGenerationPausedError(err)) throw err
    return { score: 0, passed: false, issues: ['Quality inspection missed'], repaintRecommended: false, repaintRegions: [] }
  }
}

async function extractMiddleFrame(videoUrl: string): Promise<string> {
  return videoUrl
}
