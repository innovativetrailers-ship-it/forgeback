import { type NextRequest, NextResponse } from 'next/server'
import { callLLM, type LLMModel } from '@/lib/engines/llm'
import { deductCredits, refundCredits } from '@/lib/credits'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const LLM_COSTS: Record<string, number> = {
  'claude-sonnet': 3,
  'claude-haiku':  1,
  'groq-llama':    1,
  'xai-grok':      2,
  'kimi-k2':       1,
  'qwen-max':      1,
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    model?:     string
    system?:    string
    messages?:  Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
  }
  try {
    body = (await req.json()) as typeof body
  } catch (err) {
    console.warn("[caught] src/app/api/llm/route.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { model, system, messages, maxTokens } = body
  if (!model || !messages?.length)
    return NextResponse.json({ error: 'model and messages are required' }, { status: 400 })

  if (!(model in LLM_COSTS))
    return NextResponse.json(
      { error: `Unknown model. Valid: ${Object.keys(LLM_COSTS).join(', ')}` },
      { status: 400 },
    )

  const cost = LLM_COSTS[model] ?? 2

  try {
    await deductCredits(db, userId, cost, `LLM: ${model}`)
  } catch (err) {
    console.warn("[caught] src/app/api/llm/route.ts:45", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: `Insufficient credits. ${model} costs ${cost} credits.` },
      { status: 402 },
    )
  }

  try {
    const result = await callLLM({ model: model as LLMModel, system, messages, maxTokens, source: 'api:llm' })
    return NextResponse.json(result)
  } catch (err: unknown) {
    await refundCredits(userId, cost, `LLM ${model} failed`)
    const message = err instanceof Error ? err.message : 'LLM call failed'
    console.error('[api/llm]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
