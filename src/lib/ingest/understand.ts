import {
  INGEST_UNDERSTAND_SOURCE,
  llmModelForTier,
  parseUnderstandJson,
  type IngestType,
  type UnderstandResult,
} from '@cinema/core'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'
import type { ParsedIngest } from './parse'

function jsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch (err) {
    console.warn("[caught] src/lib/ingest/understand.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

export async function understandIngest(input: {
  parsed: ParsedIngest
  type: IngestType
  projectTitle: string
  projectSummary: string
  imageUrl?: string
}): Promise<UnderstandResult> {
  const excerpt = (input.parsed.text || input.parsed.look?.summary || '').slice(0, 4000)
  const visual = input.imageUrl ?? input.parsed.frames.find((f) => /^https?:\/\//i.test(f))
  const content: Array<Record<string, unknown>> = []
  if (visual) {
    content.push({ type: 'image', source: { type: 'url', url: visual } })
  }
  content.push({
    type: 'text',
    text: `PROJECT: ${input.projectTitle}
${input.projectSummary}

DETECTED TYPE: ${input.type}
BOUNDARIES: ${JSON.stringify(input.parsed.boundaries.slice(0, 20))}
TEXT:
${excerpt || '(no text — describe the visual)'}

Return ONLY JSON: {"role":string,"description":string,"type":"script"|"treatment"|"character_ref"|"location_ref"|"rough_cut"|"style_ref"|"link"|"pdf"|"audio_sample"|"unknown","links":{"characterName":string,"locationName":string,"scene":string,"style":string}}
Classify what this is for THIS project and where it fits. Do not invent a new story.`,
  })

  const message = await claudeCall({
    model: llmModelForTier('mechanical'),
    max_tokens: 500,
    system: 'Classify uploaded project context. Return only JSON. Stay inside what the file shows. Empty strings for unknown link fields.',
    messages: [{ role: 'user', content: content as never }],
  }, { source: INGEST_UNDERSTAND_SOURCE, tier: 'mechanical' })

  return parseUnderstandJson(jsonObject(claudeText(message)), input.type)
}
