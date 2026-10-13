export interface PaidCallRecord {
  seq: number
  runId: string
  kind: string
  purpose: string
  model: string
  promptTokens?: number
  completionTokens?: number
  ms: number
  caller: string
}

const DEFAULT_BUDGET = 12

let runId = 'inline'
let seq = 0
let budget = DEFAULT_BUDGET
let calls: PaidCallRecord[] = []
let llmSeq = 0
let retries: Record<string, number> = {}

export function llmBudgetForScenes(scenes: number): number {
  const count = Number.isFinite(scenes) && scenes > 0 ? Math.ceil(scenes) : 1
  return 8 + count
}

export function beginLlmRun(id: string, nextBudget = DEFAULT_BUDGET): void {
  runId = id || 'inline'
  seq = 0
  llmSeq = 0
  budget = Number.isFinite(nextBudget) && nextBudget > 0 ? Math.ceil(nextBudget) : DEFAULT_BUDGET
  retries = {}
  calls = []
}

export function assertLlmBudget(purpose: string): void {
  if (llmSeq >= budget) {
    const error = new Error(`LLM call budget exceeded: ${llmSeq} calls`)
    console.warn('[llm_budget]', JSON.stringify({ runId, purpose, calls: llmSeq, budget }))
    throw error
  }
}

export function falCallKind(endpoint: string): string {
  const id = endpoint.toLowerCase()
  if (id.includes('openrouter') || id.includes('/router')) return 'llm'
  if (id.includes('extract-frame') || id.includes('extract_frame')) return 'frame'
  if (id.includes('/edit')) return 'image-edit'
  if (id.includes('image-to-video') || id.includes('text-to-video') || id.includes('reference-to-video') || id.includes('video')) return 'video'
  if (id.includes('nano-banana') || id.includes('flux') || id.includes('image')) return 'image'
  return 'media'
}

export function recordPaidCall(entry: Omit<PaidCallRecord, 'seq' | 'runId'>): void {
  seq += 1
  if (entry.kind === 'llm') llmSeq += 1
  const row: PaidCallRecord = { seq, runId, ...entry }
  calls.push(row)
  console.log('[paid_call]', JSON.stringify(row))
}

export function recordLlmRetry(step: string): void {
  retries[step] = (retries[step] ?? 0) + 1
  console.log('[llm_retry]', JSON.stringify({ runId, step, retryCount: retries[step] }))
}

export function recordLlmCall(entry: Omit<PaidCallRecord, 'seq' | 'runId' | 'kind'> & { kind?: string }): void {
  recordPaidCall({ ...entry, kind: 'llm' })
}

export function finishLlmRun(): number {
  const byPurpose: Record<string, number> = {}
  const byModel: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  let promptTokens = 0
  let completionTokens = 0
  for (const call of calls) {
    byPurpose[call.purpose] = (byPurpose[call.purpose] ?? 0) + 1
    byModel[call.model] = (byModel[call.model] ?? 0) + 1
    byKind[call.kind] = (byKind[call.kind] ?? 0) + 1
    promptTokens += call.promptTokens ?? 0
    completionTokens += call.completionTokens ?? 0
  }
  console.log('[paid_run]', JSON.stringify({
    runId,
    count: calls.length,
    llmCount: llmSeq,
    budget,
    promptTokens,
    completionTokens,
    byKind,
    byPurpose,
    byModel,
    retries,
  }))
  const count = calls.length
  runId = 'inline'
  seq = 0
  llmSeq = 0
  retries = {}
  calls = []
  return count
}
