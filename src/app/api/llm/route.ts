import { callLLM, type LLMModel } from '@/lib/engines/llm'
import { deductCredits }          from '@/lib/credits'
import { db }                     from '@/lib/db'

const LLM_COSTS: Record<string, number> = {
  'claude-sonnet': 3,
  'claude-haiku':  1,
  'groq-llama':    1,
  'xai-grok':      2,
  'kimi-k2':       1,
  'qwen-max':      1,
}

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    model?:     string
    system?:    string
    messages?:  Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
  }
  const { model, system, messages, maxTokens } = body

  if (!model || !messages?.length) {
    return Response.json({ error: 'model and messages required' }, { status: 400 })
  }

  const cost = LLM_COSTS[model] ?? 2
  await deductCredits(db, userId, cost, `LLM: ${model}`)

  const result = await callLLM({ model: model as LLMModel, system, messages, maxTokens })
  return Response.json(result)
}
