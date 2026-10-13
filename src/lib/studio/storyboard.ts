import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'
import { uploadToR2 } from '../storage/r2'
import { nanoid } from 'nanoid'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import { isGenerationPausedError } from '@/lib/generation/pause'

export interface StoryboardShot {
  id: string
  sceneNumber: number
  shotNumber: number
  description: string
  cameraAngle: string
  cameraMove: string
  dialogue?: string
  action: string
  generationPrompt: string
  frameUrl?: string
  durationEstimate: number
}

export interface StoryboardResult {
  shots: StoryboardShot[]
  totalDuration: number
  narrativeSummary: string
}

export async function generateStoryboard(params: {
  scriptText: string
  style: string
  targetDuration?: number
}): Promise<StoryboardResult> {
  const { scriptText, style, targetDuration } = params

  // Step 1: Parse script into shots with Claude
  const parseResponse = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: `You are a professional storyboard artist and script supervisor. Parse scripts into shot lists.
    
Output ONLY valid JSON with this schema:
{
  "shots": [
    {
      "sceneNumber": 1,
      "shotNumber": 1,
      "description": "brief shot description",
      "cameraAngle": "eye level | high angle | low angle | dutch | birds eye",
      "cameraMove": "static | pan | tilt | dolly | handheld | crane",
      "dialogue": "any spoken dialogue in this shot",
      "action": "what physically happens",
      "generationPrompt": "detailed visual prompt for AI video generation — include: subject, action, setting, lighting, camera, mood, style",
      "durationEstimate": 4.5
    }
  ],
  "narrativeSummary": "one paragraph summary"
}`,
    messages: [
      {
        role: 'user',
        content: `Parse this script into a shot list. Style: ${style}. Target duration: ${targetDuration ?? 60}s.\n\nScript:\n${scriptText}`,
      },
    ],
  }, { source: 'storyboard', tier: 'mechanical' })

  const text = claudeText(parseResponse) || '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Storyboard parser returned no JSON')

  interface ParsedShot {
    sceneNumber?: number
    shotNumber?: number
    description?: string
    cameraAngle?: string
    cameraMove?: string
    dialogue?: string
    action?: string
    generationPrompt?: string
    durationEstimate?: number
  }

  interface ParsedResult {
    shots?: ParsedShot[]
    narrativeSummary?: string
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParsedResult
  const rawShots = parsed.shots ?? []

  const shots: StoryboardShot[] = rawShots.map((s) => ({
    id: nanoid(),
    sceneNumber: s.sceneNumber ?? 1,
    shotNumber: s.shotNumber ?? 1,
    description: s.description ?? '',
    cameraAngle: s.cameraAngle ?? 'eye level',
    cameraMove: s.cameraMove ?? 'static',
    dialogue: s.dialogue,
    action: s.action ?? '',
    generationPrompt: s.generationPrompt ?? s.description ?? '',
    durationEstimate: s.durationEstimate ?? 5,
  }))

  const totalDuration = shots.reduce((sum, s) => sum + s.durationEstimate, 0)

  return { shots, totalDuration, narrativeSummary: parsed.narrativeSummary ?? '' }
}

export async function renderStoryboardFrames(
  shots: StoryboardShot[],
  onProgress?: (pct: number) => void
): Promise<StoryboardShot[]> {
  const total = shots.length
  let done = 0

  const renderedShots = await Promise.all(
    shots.map(async (shot) => {
      try {
        interface FluxResult {
          images?: Array<{ url: string }>
          image?: { url: string }
        }

        const result = await runFal(falEndpoint('flux/dev'), {
            prompt: `${shot.generationPrompt}, storyboard illustration, cinematic composition, film still`,
            image_size: 'landscape_16_9' as const,
            num_inference_steps: 28,
            guidance_scale: 3.5,
          }, undefined, 120_000, undefined, undefined, 'storyboard.frame') as FluxResult

        const imageUrl = result.images?.[0]?.url ?? result.image?.url

        if (imageUrl) {
          // Cache to R2
          const res = await fetch(imageUrl)
          const buffer = Buffer.from(await res.arrayBuffer())
          const r2Url = await uploadToR2(buffer, `storyboard/${nanoid()}.jpg`, 'image/jpeg')
          done++
          onProgress?.(Math.round((done / total) * 100))
          return { ...shot, frameUrl: r2Url }
        }
      } catch (err) {
        if (isGenerationPausedError(err)) throw err
        done++
        onProgress?.(Math.round((done / total) * 100))
      }
      return shot
    })
  )

  return renderedShots
}

export async function storyboardToPDF(shots: StoryboardShot[]): Promise<Buffer> {
  // Build a simple HTML-based storyboard layout
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; background: #111; color: #fff; }
  .shot { display: flex; margin-bottom: 24px; border: 1px solid #333; padding: 12px; }
  .frame { width: 320px; height: 180px; background: #222; flex-shrink: 0; margin-right: 16px; }
  .frame img { width: 100%; height: 100%; object-fit: cover; }
  .info h3 { margin: 0 0 8px; color: #00e5c8; }
  .info p { margin: 4px 0; font-size: 13px; }
  .prompt { font-style: italic; color: #9ca3af; font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
${shots.map((s) => `
  <div class="shot">
    <div class="frame">
      ${s.frameUrl ? `<img src="${s.frameUrl}" alt="Shot ${s.shotNumber}" />` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555">No frame</div>'}
    </div>
    <div class="info">
      <h3>Scene ${s.sceneNumber} / Shot ${s.shotNumber}</h3>
      <p><strong>Action:</strong> ${s.action}</p>
      <p><strong>Camera:</strong> ${s.cameraAngle}, ${s.cameraMove}</p>
      ${s.dialogue ? `<p><strong>Dialogue:</strong> "${s.dialogue}"</p>` : ''}
      <p><strong>Duration:</strong> ${s.durationEstimate}s</p>
      <p class="prompt">${s.generationPrompt}</p>
    </div>
  </div>
`).join('')}
</body>
</html>`

  // Return HTML as buffer (PDF generation requires puppeteer which is optional)
  return Buffer.from(html, 'utf-8')
}
