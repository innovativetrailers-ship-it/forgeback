import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasFalKey } from '@/lib/config/keys'
import { callLLM } from '@/lib/engines/llm'
import { requireUser } from '@/lib/auth/requireUser'

function extractJsonArray(text: string): unknown[] | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    console.warn("[caught] src/app/api/script/parse/route.ts:12", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

async function parseScriptWithLLM(script: string): Promise<string> {
  const request = {
    system: 'Parse a film script into scenes. Return ONLY a valid JSON array, no markdown.',
    messages: [{
      role: 'user' as const,
      content: `Parse this script into scenes:
${script}

Return JSON array:
[{ "sceneNumber": 1, "heading": "INT. COFFEE SHOP - DAY",
   "action": "...", "dialogue": [...], "characters": [], "location": "",
   "timeOfDay": "DAY|NIGHT|DAWN|DUSK", "estimatedDuration": 5 }]`,
    }],
    maxTokens: 2000,
  }

  if (!hasFalKey()) {
    throw new Error('FAL_KEY required for script parsing')
  }

  const { content } = await callLLM({ model: 'claude-opus', source: 'api:script-parse', ...request })
  if (!content.trim()) {
    throw new Error('Opus returned empty response')
  }
  return content
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let script: string | undefined
  try {
    const body = await req.json() as { script?: string }
    script = body.script
  } catch (err) {
    console.warn("[caught] src/app/api/script/parse/route.ts:55", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!script?.trim()) {
    return NextResponse.json({ scenes: [], error: 'Empty script' }, { status: 400 })
  }

  if (!hasFalKey()) {
    return NextResponse.json({ scenes: [], error: 'Script parser unavailable' }, { status: 503 })
  }

  try {
    const content = await parseScriptWithLLM(script)
    const scenes = extractJsonArray(content)
    if (!scenes) {
      return NextResponse.json({ scenes: [], error: 'Could not parse script structure' }, { status: 422 })
    }

    return NextResponse.json({ scenes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse request failed'
    console.error('[script/parse]', message)
    return NextResponse.json({ scenes: [], error: message }, { status: 500 })
  }
}
