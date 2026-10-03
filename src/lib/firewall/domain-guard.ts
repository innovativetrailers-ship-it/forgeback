/**
 * CINÉMA Knowledge Firewall
 *
 * Enforces four isolated knowledge domains at the code layer.
 * Marketing AI never learns technical routing details.
 * Technical routing never leaks model names to users.
 *
 * Implementation note: We operate on a single Postgres DB and Redis instance,
 * with domain isolation enforced by type prefixes and module-level access
 * control rather than separate database connections.
 */

import { db } from '../db'
import { redis } from '../redis'
import { claudeCall, claudeText, type ClaudeBillableClass } from '@/lib/llm/anthropicClient'

export type KnowledgeDomain = 'marketing' | 'product' | 'technical' | 'intelligence'

// ── Redis namespace helpers ───────────────────────────────────
// Prefixed keys enforce domain isolation on shared Redis
export const DOMAIN_REDIS = {
  marketing:    { prefix: 'mkt:' },
  product:      { prefix: 'prd:' },
  technical:    { prefix: 'tch:' },
  intelligence: { prefix: 'int:' },
} as const

export function intelligenceKey(key: string): string {
  return `int:${key}`
}
export function technicalKey(key: string): string {
  return `tch:${key}`
}

// ── Intelligence DB helpers ───────────────────────────────────
// All intelligence data lives in TrainingData with 'intel:' type prefixes.
// This keeps the single existing schema while maintaining domain isolation.
export const intelligenceDb = {
  async createProbeResult(data: {
    probe_id: string
    category: string
    model_id: string
    model_version: string
    prompt: string
    video_url: string
    quality_score: number
    issues: string[]
    strengths: string[]
    assessment_json: Record<string, unknown>
    generated_at: string
    tier_used: string
    generation_ms: number
  }) {
    return db.trainingData.create({
      data: {
        userId: 'system',
        type: 'intel:probe_result',
        originalUrl: data.video_url,
        instruction: data.prompt,
        metadata: JSON.parse(JSON.stringify(data)),
        isProcessed: false,
      },
    })
  },

  async createModelReport(data: {
    model_id: string
    model_version: string
    report_date: string
    generated_by: string
    report_json: Record<string, unknown>
    probe_count: number
    is_delta?: boolean
    previous_report?: string
  }) {
    return db.trainingData.create({
      data: {
        userId: 'system',
        type: 'intel:model_report',
        instruction: `Report for ${data.model_id} v${data.model_version}`,
        metadata: JSON.parse(JSON.stringify(data)),
        isProcessed: false,
      },
    })
  },

  async createModelUpdate(data: {
    model_id: string
    previous_version: string
    new_version: string
    detected_at: string
  }) {
    return db.trainingData.create({
      data: {
        userId: 'system',
        type: 'intel:model_update',
        instruction: `${data.model_id}: ${data.previous_version} → ${data.new_version}`,
        metadata: JSON.parse(JSON.stringify(data)),
        isProcessed: false,
      },
    })
  },

  async createTrainingSignals(signals: Array<{
    source_model: string
    source_version: string
    prompt: string
    video_url: string
    quality_score?: number
    failure_description?: string
    category: string
    type: string
    ingested_at: string
  }>) {
    await Promise.all(
      signals.map(s => db.trainingData.create({
        data: {
          userId: 'system',
          type: 'intel:training_signal',
          originalUrl: s.video_url,
          instruction: s.prompt,
          metadata: JSON.parse(JSON.stringify(s)),
          isProcessed: false,
        },
      }))
    )
  },

  async findLatestReport(model_id: string) {
    return db.trainingData.findFirst({
      where: { type: 'intel:model_report', instruction: { contains: model_id } },
      orderBy: { createdAt: 'desc' },
    })
  },

  async getProbeResultsForModel(model_id: string, since?: Date) {
    return db.trainingData.findMany({
      where: {
        type: 'intel:probe_result',
        ...(since && { createdAt: { gte: since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  },

  async getTrainingSignalCount() {
    return db.trainingData.count({ where: { type: 'intel:training_signal', isProcessed: false } })
  },
}

// ── Marketing domain vocabulary ───────────────────────────────
// What marketing AI is ALLOWED to know about
export const MARKETING_VOCABULARY = [
  'cinematic quality', 'creative vision', 'professional results',
  'seamless generation', 'studio-grade output', 'intelligent routing',
  'Draft mode', 'Studio mode', 'Blockbuster mode',
  'your story', 'your characters', 'your world',
] as const

// Terms BLOCKED from reaching marketing AI context
const MARKETING_BLOCKED_TERMS = [
  'Kling', 'Veo', 'Seedance', 'Runway', 'Wan', 'LTX', 'HunyuanVideo',
  'SkyReels', 'CogVideoX', 'Minimax', 'Pika', 'Mochi',
  'ELO', 'benchmark', 'routing', 'model selection', 'API cost',
  'fal.ai', 'SwarmRouter', 'SceneCategory', 'physics score',
  'SCENE_ROUTING_MATRIX', 'complexity_type', 'credit cost',
  'ByteDance', 'Kuaishou', 'Alibaba', 'Tencent', 'Zhipu',
  'VBench', 'MovieGenBench', 'Artificial Analysis',
]

export function sanitiseForMarketing(content: string): string {
  let sanitised = content
  MARKETING_BLOCKED_TERMS.forEach(term => {
    sanitised = sanitised.replace(new RegExp(term, 'gi'), '[REDACTED]')
  })
  return sanitised
}

// Terms BLOCKED from reaching product/user-facing context
const PRODUCT_BLOCKED_TERMS = [
  'API cost', 'credit cost per second', 'ELO score', 'VBench',
  'SwarmRouter', 'SceneCategory', 'SCENE_ROUTING_MATRIX',
  'fal.ai endpoint', 'ByteDance API', 'model routing table',
]

export function sanitiseForProduct(content: string): string {
  let sanitised = content
  PRODUCT_BLOCKED_TERMS.forEach(term => {
    sanitised = sanitised.replace(new RegExp(term, 'gi'), '[REDACTED]')
  })
  return sanitised
}

// ── Domain-aware LLM call ─────────────────────────────────────
export async function callDomainLLM(
  domain: KnowledgeDomain,
  params: {
    source: string
    billableClass?: ClaudeBillableClass
    systemPrompt: string
    userMessage: string
    requireJSON?: boolean
    model?: string
  },
): Promise<string> {
  const modelMap: Record<KnowledgeDomain, string> = {
    marketing:    'claude-haiku-4-5',
    product:      'claude-sonnet-4-5',
    technical:    'claude-sonnet-4-5',
    intelligence: 'claude-haiku-4-5',
  }
  const model = params.model ?? modelMap[domain]
  const billableClass = params.billableClass ?? (domain === 'intelligence' ? 'eval' : 'background')

  const msg = await claudeCall(
    {
      model,
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
    },
    { source: params.source, billableClass },
  )

  const raw = claudeText(msg)
  return params.requireJSON
    ? raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    : raw
}

// ── Guard assertions ──────────────────────────────────────────
// Call these at module boundaries to enforce isolation
export function assertTechnicalDomain(callerModule: string): void {
  // In production this can check the call stack or module path
  // For now, it's a documentation-level assertion
  if (callerModule.includes('marketing') || callerModule.includes('product')) {
    throw new Error(`[Firewall] Technical routing data cannot be accessed from domain: ${callerModule}`)
  }
}

export function assertIntelligenceDomain(callerModule: string): void {
  if (callerModule.includes('marketing') || callerModule.includes('product')) {
    throw new Error(`[Firewall] Intelligence data cannot be accessed from domain: ${callerModule}`)
  }
}

// ── Redis intelligence queue helpers ─────────────────────────
export async function pushIntelligenceSignal(queue: string, data: unknown): Promise<void> {
  await redis.lpush(intelligenceKey(queue), JSON.stringify(data))
}

export async function getIntelligenceQueueLength(queue: string): Promise<number> {
  return redis.llen(intelligenceKey(queue))
}

export async function popIntelligenceSignal(queue: string): Promise<string | null> {
  return redis.rpop(intelligenceKey(queue))
}
