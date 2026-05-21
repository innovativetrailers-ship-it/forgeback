import type OpenAI from 'openai'
import { execSync } from 'child_process'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'
import type { TimelineRecipe } from '../timeline/schema'
import { getOpenRouterClient } from '../brain/openai-client'

interface ContinuityError {
  type: 'prop' | 'costume' | 'lighting' | 'time_jump' | 'character_mismatch'
  severity: 'warning' | 'error'
  clips: [string, string]
  description: string
  suggestion: string
}

export async function checkContinuity(recipe: TimelineRecipe): Promise<ContinuityError[]> {
  const videoClips = recipe.tracks
    .filter((t) => t.type === 'video')
    .flatMap((t) => t.clips)
    .filter((c) => c.sourceUrl)

  if (videoClips.length < 2) return []

  const jobId = nanoid()
  const tmpDir = `/tmp/continuity-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  const frames: Array<{ clipId: string; base64: string }> = []

  try {
    // Extract a representative thumbnail from each clip
    for (const clip of videoClips) {
      const framePath = join(tmpDir, `${clip.id}.jpg`)
      try {
        execSync(
          `ffmpeg -i "${clip.sourceUrl}" -vframes 1 -ss 00:00:01 "${framePath}" -y 2>/dev/null`
        )
        const b64 = execSync(`base64 "${framePath}"`).toString().trim()
        frames.push({ clipId: clip.id, base64: b64 })
      } catch {
        // Skip clips that can't be read
      }
    }

    if (frames.length < 2) return []

    // Send all frames to Gemini with continuity checking prompt
    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = frames.slice(0, 10).map((f) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${f.base64}`,
      },
    }))

    const clipIds = frames.slice(0, 10).map((f) => f.clipId)

    const response = await getOpenRouterClient().chat.completions.create({
      model: 'google/gemini-1.5-pro',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: `You are a professional film continuity supervisor. The ${frames.length} images above are representative frames from consecutive video clips in a film. The clip IDs in order are: ${clipIds.join(', ')}.

Analyse each pair of consecutive clips for continuity errors. Look for:
- Costume or wardrobe changes (different clothing between clips)
- Prop inconsistencies (objects appearing/disappearing)  
- Lighting discontinuities (dramatic mood/colour temperature shifts)
- Time jumps (day/night inconsistencies)
- Character appearance mismatches

Return ONLY valid JSON as an array of objects with this schema:
{
  "type": "prop" | "costume" | "lighting" | "time_jump" | "character_mismatch",
  "severity": "warning" | "error",
  "clips": ["clipId1", "clipId2"],
  "description": "what is inconsistent",
  "suggestion": "how to fix it"
}

If no errors found, return [].`,
            },
          ],
        },
      ],
    })

    const text = response.choices[0]?.message?.content ?? '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    return JSON.parse(jsonMatch[0]) as ContinuityError[]
  } catch {
    return []
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
