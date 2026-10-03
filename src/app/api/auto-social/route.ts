import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { generateMusic } from '@/lib/audio/suno'
import { detectBeats } from '@/lib/audio/beats'
import { checkAndDeductCredits } from '@/lib/credits'
import { nanoid } from 'nanoid'
import type { TimelineRecipe, Track, Clip } from '@/lib/timeline/schema'

const schema = z.object({
  assetUrls: z.array(z.string().url()).min(1).max(30),
  projectId: z.string(),
  targetPlatform: z.enum(['tiktok', 'instagram', 'youtube', 'general']).default('general'),
})

interface EditClip {
  assetIndex: number
  startTime: number
  endTime: number
  kenBurns?: { startScale: number; endScale: number; x: number; y: number }
  transition?: string
  emotionalTone?: string
}

interface AutoSocialPlan {
  narrative: string
  targetDuration: number
  selectedClips: EditClip[]
  musicPrompt: string
  captionSuggestion: string
  hashtagSuggestions: string[]
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { assetUrls, projectId, targetPlatform } = parsed.data

  try {
    await checkAndDeductCredits(userId, 'auto_social')
  } catch (err) {
    console.warn("[caught] src/app/api/auto-social/route.ts:46", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  // Build Claude Vision request with all assets
  const imageContent = assetUrls.slice(0, 20).map((url, i) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }))

  const platformGuidance =
    targetPlatform === 'tiktok'
      ? 'vertical format 9:16, energetic edits, trending audio style, 15-60s'
      : targetPlatform === 'instagram'
      ? 'square or 4:5 format, aesthetic visuals, lifestyle feel, 30-90s'
      : targetPlatform === 'youtube'
      ? 'horizontal 16:9, longer form allowed, 60-180s'
      : 'horizontal 16:9, 30-90 seconds'

  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a professional social media film editor. Analyze visual assets and create an optimised edit list for a compelling social media video. Platform: ${platformGuidance}. Return ONLY valid JSON, no explanations.`,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `I have ${assetUrls.length} visual assets (shown above). Create an edit plan. Return JSON:
{
  "narrative": "one sentence story",
  "targetDuration": 45,
  "selectedClips": [
    {
      "assetIndex": 0,
      "startTime": 0,
      "endTime": 3.5,
      "kenBurns": {"startScale": 1.0, "endScale": 1.15, "x": 0, "y": 0},
      "transition": "dissolve",
      "emotionalTone": "energetic"
    }
  ],
  "musicPrompt": "upbeat, driving rhythm",
  "captionSuggestion": "caption text",
  "hashtagSuggestions": ["#cinema"]
}`,
          },
        ],
      },
    ],
  }, { source: 'autosocial' })

  const text = claudeText(response) || '{}'

  let plan: AutoSocialPlan
  try {
    // Extract JSON from response (Claude may wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    plan = JSON.parse(jsonMatch?.[0] ?? text) as AutoSocialPlan
  } catch (err) {
    console.warn("[caught] src/app/api/auto-social/route.ts:107", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Failed to parse AI edit plan' }, { status: 500 })
  }

  // Generate beat-matched music
  let musicUrl: string | null = null
  let beats: number[] = []

  try {
    const music = await generateMusic({
      prompt: plan.musicPrompt,
      durationSeconds: plan.targetDuration,
      instrumental: true,
    })
    musicUrl = music.audioUrl

    const beatAnalysis = await detectBeats(musicUrl)
    beats = beatAnalysis.downbeats
  } catch (err) {
    console.warn("[caught] src/app/api/auto-social/route.ts:125", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Music generation failure is non-fatal
  }

  // Align clips to beat timestamps if available
  const alignedClips = plan.selectedClips.map((clip, i) => {
    if (beats.length > i) {
      const beatStart = beats[i]
      const beatEnd = beats[i + 1] ?? beatStart + (clip.endTime - clip.startTime)
      return { ...clip, startTime: beatStart, endTime: beatEnd }
    }
    return clip
  })

  // Build TimelineRecipe
  const videoTrackId = nanoid()
  const musicTrackId = nanoid()

  const videoClips: Clip[] = alignedClips.map((c) => ({
    id: nanoid(),
    trackId: videoTrackId,
    startTime: c.startTime,
    endTime: c.endTime,
    sourceUrl: assetUrls[c.assetIndex] ?? assetUrls[0],
    transition: c.transition
      ? { type: c.transition as Clip['transition'] extends { type: string } ? Clip['transition']['type'] : never, duration: 0.5 }
      : undefined,
    transform: c.kenBurns
      ? { x: c.kenBurns.x, y: c.kenBurns.y, scale: c.kenBurns.startScale, rotation: 0, opacity: 1 }
      : undefined,
    metadata: { emotionalTone: c.emotionalTone },
  }))

  const tracks: Track[] = [
    {
      id: videoTrackId,
      type: 'video',
      label: 'VIDEO 1',
      muted: false,
      locked: false,
      solo: false,
      clips: videoClips,
    },
    ...(musicUrl
      ? [{
          id: musicTrackId,
          type: 'audio' as const,
          label: 'MUSIC',
          muted: false,
          locked: false,
          solo: false,
          volume: 80,
          clips: [
            {
              id: nanoid(),
              trackId: musicTrackId,
              startTime: 0,
              endTime: plan.targetDuration,
              sourceUrl: musicUrl,
            },
          ],
        }]
      : []),
  ]

  const recipe: TimelineRecipe = {
    id: nanoid(),
    projectId,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: plan.targetDuration,
    colorSpace: 'rec709',
    tracks,
  }

  return NextResponse.json({
    recipe,
    plan: {
      narrative: plan.narrative,
      captionSuggestion: plan.captionSuggestion,
      hashtagSuggestions: plan.hashtagSuggestions,
      musicUrl,
    },
  })
}
