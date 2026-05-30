import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import Anthropic                      from '@anthropic-ai/sdk'
import { fal }                        from '@fal-ai/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface StoryboardScene {
  sceneNumber:    number
  heading:        string      // INT. LOCATION — DAY
  description:    string      // visual description for image gen
  dialogue:       string      // sample dialogue
  imageUrl:       string      // generated storyboard frame
  videoPrompt:    string      // prompt for video generation
}

/** Parse Fountain format screenplay into scene list */
function parseFountain(screenplay: string): Array<{ heading: string; body: string }> {
  const lines = screenplay.split('\n')
  const scenes: Array<{ heading: string; body: string }> = []
  let current: { heading: string; body: string } | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Scene headings: INT./EXT. LOCATION — DAY/NIGHT
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed) || /^\./.test(trimmed)) {
      if (current) scenes.push(current)
      current = { heading: trimmed.replace(/^\./, ''), body: '' }
    } else if (current) {
      current.body += ' ' + trimmed
    }
  }

  if (current) scenes.push(current)
  return scenes.slice(0, 20) // cap at 20 scenes per storyboard
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    screenplay:  string
    style?:      'cinematic' | 'noir' | 'animation' | 'documentary'
    generateAll?: boolean  // also start video gen queue for each scene
  }

  const { screenplay, style = 'cinematic' } = body
  if (!screenplay?.trim()) return NextResponse.json({ error: 'screenplay required' }, { status: 400 })

  const rawScenes = parseFountain(screenplay)
  if (rawScenes.length === 0) {
    return NextResponse.json({ error: 'No scenes found — use Fountain format (INT./EXT. headings)' }, { status: 400 })
  }

  // Charge credits: 5 per scene
  await checkAndDeductCredits(userId, 'storyboard')

  try {
    // Step 1: Claude generates visual descriptions for each scene
    const descriptionsMsg = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: `You are a professional storyboard artist. For each scene below, write a concise visual description (1-2 sentences) for a ${style} style storyboard image. Include key visual elements, lighting, camera angle, and mood. Also write a short video generation prompt (max 20 words).\n\nScenes:\n${rawScenes.map((s, i) => `Scene ${i + 1}: ${s.heading}\n${s.body.slice(0, 300)}`).join('\n\n')}\n\nRespond as JSON array: [{"sceneNumber": 1, "description": "...", "dialogue": "...", "videoPrompt": "..."}]`,
      }],
    })

    const content = descriptionsMsg.content[0]
    if (content.type !== 'text') throw new Error('Unexpected Claude response type')

    let sceneDescs: Array<{
      sceneNumber: number
      description: string
      dialogue:    string
      videoPrompt: string
    }> = []

    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) sceneDescs = JSON.parse(jsonMatch[0]) as typeof sceneDescs
    } catch {
      throw new Error('Failed to parse Claude storyboard response')
    }

    // Step 2: Generate storyboard images in parallel (max 5 concurrent)
    const BATCH_SIZE = 5
    const scenes: StoryboardScene[] = []

    for (let i = 0; i < sceneDescs.length; i += BATCH_SIZE) {
      const batch = sceneDescs.slice(i, i + BATCH_SIZE)

      const images = await Promise.all(batch.map(async (desc) => {
        const raw = rawScenes[desc.sceneNumber - 1]
        try {
          const result = await fal.subscribe('fal-ai/flux/schnell', {
            input: {
              prompt:           `${style} film storyboard: ${desc.description}`,
              image_size:       'landscape_16_9',
              num_inference_steps: 4,
              num_images:       1,
            },
          })
          const data = result.data as { images?: Array<{ url: string }> }
          return {
            sceneNumber: desc.sceneNumber,
            heading:     raw?.heading ?? `Scene ${desc.sceneNumber}`,
            description: desc.description,
            dialogue:    desc.dialogue ?? '',
            imageUrl:    data.images?.[0]?.url ?? '',
            videoPrompt: desc.videoPrompt,
          }
        } catch {
          return {
            sceneNumber: desc.sceneNumber,
            heading:     raw?.heading ?? `Scene ${desc.sceneNumber}`,
            description: desc.description,
            dialogue:    desc.dialogue ?? '',
            imageUrl:    '',
            videoPrompt: desc.videoPrompt,
          }
        }
      }))

      scenes.push(...images)
    }

    scenes.sort((a, b) => a.sceneNumber - b.sceneNumber)

    return NextResponse.json({ scenes, totalScenes: scenes.length })
  } catch (err) {
    await refundCredits(userId, rawScenes.length * 5, 'Storyboard generation failed')
    console.error('[storyboard]', err)
    return NextResponse.json({ error: 'Storyboard generation failed' }, { status: 500 })
  }
}
