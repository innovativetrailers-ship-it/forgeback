# CINEMATIC FORGE — COGNITIVE DIRECTOR ENHANCEMENTS
## Cursor Agent Prompt (builds on CINEMA_cognitive_director_cursor_prompt.md)
### Live performance matrix · Schema-driven payloads · Continuity state · Reward signals · Knowledge graph

---

## WHAT THIS ADDS

The Cognitive Director gave you intent, emotion, imagination, memory, and learning. This adds
the production-robustness and self-optimisation layers from the multi-agent analysis:

1. **Live Performance Matrix** — route on real-time latency + cost + success, not just history
2. **Schema-Driven Payload Builder** — read each FAL model's actual schema → never send wrong params
3. **Structured Continuity State** — wardrobe/props/character state persist across scenes
4. **Implicit Reward Signals** — learn from export (good) vs regenerate (bad), not just scores
5. **Lightweight Knowledge Graph** — relational creative rules for multi-hop reasoning
6. **Seed Preservation** — reproduce a past look exactly

---

## ENHANCEMENT 1 — LIVE PERFORMANCE MATRIX (solves slow-model routing)

Your `RoutingPolicy` learns historical success. This adds LIVE latency + cost + failure
tracking so a model that's slow or erroring *right now* gets deprioritised immediately.

### 1a — Schema additions

**Add to** `prisma/schema.prisma`:

```prisma
model ModelPerformance {
  id              String   @id @default(cuid())
  model           String   @unique
  // Rolling live metrics
  avgLatencyMs    Float    @default(60000)
  p95LatencyMs    Float    @default(120000)
  successRate     Float    @default(1.0)     // last-N success ratio
  recentFailures  Int      @default(0)        // consecutive failures (circuit breaker)
  costPer5sCredits Int     @default(10)
  // Live health
  status          String   @default("healthy") // healthy | degraded | down
  lastCheckedAt   DateTime @default(now())
  sampleCount     Int      @default(0)
  @@index([status])
}
```

```bash
npx prisma migrate dev --name model_performance_matrix
npx prisma generate
```

### 1b — Performance tracker

**Create** `src/lib/cognition/performance.ts`:

```typescript
// src/lib/cognition/performance.ts
// Live performance matrix — latency, cost, success tracked in real time

import { db } from '@/lib/db'
import { MODEL_COSTS } from '@/lib/routing/engineRegistry'

const FAILURE_CIRCUIT_THRESHOLD = 3   // consecutive failures → mark down

// Record the outcome of a single generation
export async function recordPerformance(params: {
  model:     string
  latencyMs: number
  success:   boolean
}): Promise<void> {
  const existing = await db.modelPerformance.findUnique({ where: { model: params.model } }).catch(() => null)
  const cost = MODEL_COSTS[params.model] ?? 10

  if (!existing) {
    await db.modelPerformance.create({
      data: {
        model: params.model, avgLatencyMs: params.latencyMs, p95LatencyMs: params.latencyMs,
        successRate: params.success ? 1 : 0, recentFailures: params.success ? 0 : 1,
        costPer5sCredits: cost, sampleCount: 1,
        status: params.success ? 'healthy' : 'degraded',
      },
    })
    return
  }

  const n          = existing.sampleCount
  const newLatency = (existing.avgLatencyMs * n + params.latencyMs) / (n + 1)
  const newSuccess = (existing.successRate * Math.min(n, 20) + (params.success ? 1 : 0)) / (Math.min(n, 20) + 1)
  const failures   = params.success ? 0 : existing.recentFailures + 1
  const p95        = Math.max(existing.p95LatencyMs * 0.9, params.latencyMs)  // decaying p95

  const status =
    failures >= FAILURE_CIRCUIT_THRESHOLD ? 'down' :
    (newLatency > 600_000 || newSuccess < 0.6) ? 'degraded' : 'healthy'

  await db.modelPerformance.update({
    where: { model: params.model },
    data: {
      avgLatencyMs: newLatency, p95LatencyMs: p95, successRate: newSuccess,
      recentFailures: failures, status, sampleCount: n + 1, lastCheckedAt: new Date(),
    },
  })
}

// Cost-benefit score for routing: high success + low latency + reasonable cost = high score
export async function scoreModelsLive(pool: string[]): Promise<Record<string, number>> {
  const perfs = await db.modelPerformance.findMany({ where: { model: { in: pool } } })
  const perfMap = new Map(perfs.map(p => [p.model, p]))

  const scores: Record<string, number> = {}
  for (const model of pool) {
    const p = perfMap.get(model)
    if (!p) { scores[model] = 0.5; continue }       // unknown = neutral
    if (p.status === 'down') { scores[model] = 0; continue }   // circuit broken

    // Weighted: success 50%, speed 30%, cost 20%
    const speedScore = Math.max(0, 1 - p.avgLatencyMs / 600_000)   // 0 at 10min, 1 at instant
    const costScore  = Math.max(0, 1 - p.costPer5sCredits / 35)     // 0 at most expensive
    const penalty    = p.status === 'degraded' ? 0.5 : 1
    scores[model] = (p.successRate * 0.5 + speedScore * 0.3 + costScore * 0.2) * penalty
  }
  return scores
}

// Models currently safe to use (circuit breaker open)
export async function getHealthyModels(pool: string[]): Promise<string[]> {
  const perfs = await db.modelPerformance.findMany({ where: { model: { in: pool }, status: 'down' } })
  const down = new Set(perfs.map(p => p.model))
  return pool.filter(m => !down.has(m))
}
```

### 1c — DAG router uses live scores

**Edit** `src/lib/orchestration/dagRouter.ts` `selectModel` — add live scoring as Priority 0.7:

```typescript
import { scoreModelsLive, getHealthyModels } from '@/lib/cognition/performance'

// Make selectModel async. New priority order:
async function selectModel(shot, availablePool: string[]): Promise<string> {
  // Filter out circuit-broken models FIRST — never route to a down model
  const healthy = await getHealthyModels(availablePool)
  const pool = healthy.length ? healthy : availablePool   // fallback if all down

  // Priority 0: Claude's pool-aware suggestion (if healthy)
  if (shot.suggestedModel && pool.includes(shot.suggestedModel)) return shot.suggestedModel

  // Priority 0.5: learned historical policy
  const learned = await getLearnedBestModel(shot.contentType, pool)

  // Priority 0.7: blend learned policy with LIVE performance
  const liveScores = await scoreModelsLive(pool)
  const matrix = CONTENT_ROUTING[shot.contentType] ?? []
  const candidates = matrix.filter(m => pool.includes(m))

  if (candidates.length) {
    // Pick the content-type candidate with the best live score
    const best = candidates.sort((a, b) => (liveScores[b] ?? 0.5) - (liveScores[a] ?? 0.5))[0]
    // If the learned best is also healthy and close, prefer it
    if (learned && (liveScores[learned] ?? 0) > (liveScores[best] ?? 0) * 0.9) return learned
    return best
  }

  return learned ?? pool[0] ?? 'ltx-2.3-fast'
}
```

### 1d — Worker records performance

**Edit** `src/lib/orchestration/bridgedGeneration.ts` — wrap each generation with timing:

```typescript
import { recordPerformance } from '@/lib/cognition/performance'

// Around each segment generation:
const t0 = Date.now()
let success = false
try {
  videoUrl = (await withTimeout(callVideoModel({ ... }), timeoutMs, label)).videoUrl!
  success = true
} finally {
  await recordPerformance({
    model: node.assignedModel, latencyMs: Date.now() - t0, success,
  }).catch(() => {})
}
```

> Now if Wan starts taking 900s, its live score craters and the router stops choosing it —
> automatically, within a few samples, without you touching the config.

---

## ENHANCEMENT 2 — SCHEMA-DRIVEN PAYLOAD BUILDER (robustness)

Stop hardcoding FAL input shapes. Read each model's actual schema and build the correct
payload — so a model that expects `aspect_ratio` vs `ratio` vs `resolution` never silently fails.

**Create** `src/lib/cognition/schemaPayload.ts`:

```typescript
// src/lib/cognition/schemaPayload.ts
// Build correct FAL payloads by inspecting each model's input schema

interface CachedSchema { schema: any; fetchedAt: number }
const schemaCache = new Map<string, CachedSchema>()
const SCHEMA_TTL = 3_600_000   // 1 hour

async function getModelSchema(falModelId: string): Promise<any> {
  const cached = schemaCache.get(falModelId)
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL) return cached.schema

  try {
    // FAL exposes OpenAPI schema per model
    const res = await fetch(`https://fal.run/${falModelId}/schema`, {
      headers: { Authorization: `Key ${process.env.FAL_API_KEY}` },
    }).then(r => r.json())
    schemaCache.set(falModelId, { schema: res, fetchedAt: Date.now() })
    return res
  } catch {
    return null   // fall back to default payload if schema unavailable
  }
}

// Build a payload that matches the model's actual accepted inputs
export async function buildPayload(
  falModelId: string,
  intent: { prompt: string; duration: number; imageUrl?: string; referenceUrl?: string }
): Promise<Record<string, unknown>> {
  const schema = await getModelSchema(falModelId)

  // Default payload (used if schema fetch fails)
  const base: Record<string, unknown> = {
    prompt: intent.prompt,
    duration: intent.duration,
    aspect_ratio: '16:9',
    resolution: '1080p',
  }
  if (intent.imageUrl)     base.image_url = intent.imageUrl
  if (intent.referenceUrl) base.reference_image_url = intent.referenceUrl

  if (!schema?.input) return base

  // Map our intent to whatever field names the model actually accepts
  const props = schema.input.properties ?? {}
  const payload: Record<string, unknown> = {}

  // prompt field — could be 'prompt', 'text', 'prompt_text'
  const promptKey = ['prompt', 'text', 'prompt_text'].find(k => k in props) ?? 'prompt'
  payload[promptKey] = intent.prompt

  // duration — 'duration', 'num_frames', 'seconds', 'video_length'
  if ('duration' in props)        payload.duration = intent.duration
  else if ('seconds' in props)    payload.seconds = intent.duration
  else if ('video_length' in props) payload.video_length = intent.duration

  // aspect ratio — 'aspect_ratio', 'ratio', 'resolution'
  if ('aspect_ratio' in props) payload.aspect_ratio = '16:9'
  else if ('ratio' in props)   payload.ratio = '16:9'

  // resolution
  if ('resolution' in props) payload.resolution = '1080p'

  // image conditioning — 'image_url', 'image', 'init_image'
  if (intent.imageUrl) {
    const imgKey = ['image_url', 'image', 'init_image', 'start_image'].find(k => k in props)
    if (imgKey) payload[imgKey] = intent.imageUrl
  }

  // reference image — 'reference_image_url', 'ref_image', 'subject_reference'
  if (intent.referenceUrl) {
    const refKey = ['reference_image_url', 'ref_image', 'subject_reference'].find(k => k in props)
    if (refKey) payload[refKey] = intent.referenceUrl
  }

  return Object.keys(payload).length ? payload : base
}
```

**Edit** `bridgedGeneration.ts` `callFalModel` to use it:

```typescript
import { buildPayload } from '@/lib/cognition/schemaPayload'

async function callFalModel(modelId: string, intent: {...}, onSubProgress?) {
  const input = await buildPayload(modelId, intent)   // ← schema-correct payload
  const result = await fal.subscribe(modelId, { input, logs: true, onQueueUpdate: ... })
  return result.data?.video?.url ?? ...
}
```

> This is the robustness fix for the stale-endpoint failures. When FAL changes a model's
> params, the payload adapts instead of silently sending wrong fields.

---

## ENHANCEMENT 3 — STRUCTURED CONTINUITY STATE

Working memory now tracks explicit state — wardrobe, props, lighting, character position —
so "MAYA puts on a red jacket in scene 1" persists into every later scene.

**Create** `src/lib/cognition/continuity.ts`:

```typescript
// src/lib/cognition/continuity.ts
// Structured continuity state carried scene-to-scene (working memory)

export interface ContinuityState {
  characters: Record<string, {
    wardrobe:  string[]      // ['red leather jacket', 'silver watch']
    state:     string        // 'wet from rain', 'injured left arm'
    position?: string
  }>
  props:      string[]        // ['briefcase', 'coffee cup']
  environment: {
    timeOfDay: string
    weather:   string
    lighting:  string
  }
}

// Extract continuity facts from a shot's content via Claude
export async function extractContinuity(
  shotPrompt: string,
  prior: ContinuityState | null
): Promise<ContinuityState> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'Track film continuity state. Update the prior state with anything new this shot establishes. Return ONLY JSON.',
      messages: [{
        role: 'user',
        content: `Prior continuity: ${JSON.stringify(prior ?? {})}
This shot: "${shotPrompt}"

Return updated ContinuityState JSON:
{ "characters": { "NAME": { "wardrobe": [], "state": "", "position": "" } },
  "props": [], "environment": { "timeOfDay": "", "weather": "", "lighting": "" } }`,
      }],
    }),
  }).then(r => r.json())

  try {
    return JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim())
  } catch {
    return prior ?? { characters: {}, props: [], environment: { timeOfDay: '', weather: '', lighting: '' } }
  }
}

// Inject continuity into a shot prompt so the model keeps state consistent
export function applyContinuity(prompt: string, state: ContinuityState): string {
  const wardrobe = Object.entries(state.characters)
    .map(([name, c]) => `${name} wearing ${c.wardrobe.join(', ')}${c.state ? `, ${c.state}` : ''}`)
    .join('; ')
  const env = `${state.environment.timeOfDay} ${state.environment.weather} ${state.environment.lighting}`.trim()
  return `${prompt}${wardrobe ? ` [Continuity: ${wardrobe}]` : ''}${env ? ` [Setting: ${env}]` : ''}`
}
```

**Edit** `parallelGeneration.ts` / `bridgedGeneration.ts` — thread continuity through a chain:

```typescript
import { extractContinuity, applyContinuity } from '@/lib/cognition/continuity'

// Within a chain, carry continuity state forward:
let continuity: ContinuityState | null = null
for (const shot of chain.shots) {
  continuity = await extractContinuity(shot.visualPrompt, continuity)
  const prompt = applyContinuity(shot.visualPrompt, continuity)
  // ... generate with the continuity-enriched prompt ...
}
```

> Now the red jacket, the rain-soaked hair, the briefcase — all persist across scene cuts,
> not just within a single bridged segment.

---

## ENHANCEMENT 4 — IMPLICIT REWARD SIGNALS

Learn from what users DO, not just quality scores. Export = strong positive. Regenerate =
negative. Watch-to-end = positive. This sharpens both routing and creative learning.

**Add to** `prisma/schema.prisma`:

```prisma
model RewardSignal {
  id         String   @id @default(cuid())
  userId     String
  jobId      String?
  model      String?
  contentType String?
  signal     String   // 'export' | 'regenerate' | 'watch_complete' | 'discard' | 'thumbs_up' | 'thumbs_down'
  reward     Float    // +1 export, +0.5 watch_complete, -1 regenerate, -0.5 discard
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([model])
}
```

**Create** `src/app/api/feedback/signal/route.ts`:

```typescript
// src/app/api/feedback/signal/route.ts

import { db } from '@/lib/db'
import { recordPerformance } from '@/lib/cognition/performance'
import { updateRoutingPolicy } from '@/lib/cognition/learn'

const REWARD_MAP: Record<string, number> = {
  export: 1.0, watch_complete: 0.5, thumbs_up: 0.8,
  regenerate: -1.0, discard: -0.5, thumbs_down: -0.8,
}

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, signal } = await req.json()
  const reward = REWARD_MAP[signal] ?? 0

  // Pull the job's segments to attribute reward to the right models
  const job = await db.renderJob.findUnique({ where: { id: jobId } }).catch(() => null)
  const segments = (job?.metadata as any)?.segments ?? []

  await db.rewardSignal.create({ data: { userId, jobId, signal, reward } })

  // Feed reward into routing policy — models in an exported film get reinforced;
  // models in a regenerated film get penalised
  for (const seg of segments) {
    // Convert reward to a pseudo-quality adjustment
    const adjusted = Math.max(0, Math.min(1, (seg.qualityScore ?? 0.7) + reward * 0.2))
    await updateRoutingPolicy(seg.contentType ?? 'unknown', seg.model, adjusted, 60).catch(() => {})
  }

  return Response.json({ recorded: true })
}
```

**Frontend** — fire the signal on user actions:

```tsx
// On "Export Film" click:
fetch('/api/feedback/signal', { method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, signal: 'export' }) })

// On "Regenerate" / "Redo" click:
fetch('/api/feedback/signal', { method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, signal: 'regenerate' }) })
```

> The system now learns from behaviour. A model whose outputs keep getting regenerated quietly
> falls out of favour; one whose films get exported rises. This is the RLAIF loop, grounded in
> real user actions.

---

## ENHANCEMENT 5 — LIGHTWEIGHT KNOWLEDGE GRAPH

Your semantic memory is a vector store (great for similarity). Add relational creative rules
for multi-hop reasoning — "noir → low-key lighting → high-contrast grade → slow pacing."

**Add to** `prisma/schema.prisma`:

```prisma
model CraftRule {
  id          String   @id @default(cuid())
  subject     String   // 'noir'
  relation    String   // 'pairs_with' | 'requires' | 'avoids'
  object      String   // 'low_key_lighting'
  confidence  Float    @default(0.6)
  source      String   // 'learned' | 'seeded'
  reinforceCount Int   @default(1)
  createdAt   DateTime @default(now())
  @@unique([subject, relation, object])
  @@index([subject])
}
```

**Create** `src/lib/cognition/knowledgeGraph.ts`:

```typescript
// src/lib/cognition/knowledgeGraph.ts
// Relational craft rules — multi-hop creative reasoning

import { db } from '@/lib/db'

// Seed with film-craft fundamentals
export const SEED_RULES = [
  { subject: 'noir',          relation: 'pairs_with', object: 'low_key_lighting' },
  { subject: 'low_key_lighting', relation: 'pairs_with', object: 'high_contrast_grade' },
  { subject: 'tension',       relation: 'pairs_with', object: 'slow_push_in' },
  { subject: 'action',        relation: 'pairs_with', object: 'rapid_cuts' },
  { subject: 'action',        relation: 'pairs_with', object: 'dynamic_tracking' },
  { subject: 'wonder',        relation: 'pairs_with', object: 'wide_aerial' },
  { subject: 'intimacy',      relation: 'pairs_with', object: 'shallow_depth_of_field' },
  { subject: 'horror',        relation: 'pairs_with', object: 'desaturated_palette' },
  { subject: 'nostalgia',     relation: 'pairs_with', object: 'warm_grade' },
  { subject: 'nostalgia',     relation: 'pairs_with', object: 'film_grain' },
]

export async function seedKnowledgeGraph(): Promise<void> {
  for (const r of SEED_RULES) {
    await db.craftRule.upsert({
      where:  { subject_relation_object: { subject: r.subject, relation: r.relation, object: r.object } },
      update: {},
      create: { ...r, confidence: 0.8, source: 'seeded' },
    }).catch(() => {})
  }
}

// Multi-hop: given a mood, traverse the graph for craft recommendations
export async function recommendCraft(mood: string, depth = 2): Promise<string[]> {
  const visited = new Set<string>()
  const recommendations: string[] = []
  let frontier = [mood]

  for (let d = 0; d < depth; d++) {
    const rules = await db.craftRule.findMany({
      where: { subject: { in: frontier }, relation: 'pairs_with' },
      orderBy: { confidence: 'desc' },
    })
    const next: string[] = []
    for (const r of rules) {
      if (!visited.has(r.object)) {
        visited.add(r.object)
        recommendations.push(r.object)
        next.push(r.object)
      }
    }
    frontier = next
    if (!frontier.length) break
  }
  return recommendations
}

// Learn a new rule (called during consolidation when a pattern proves out)
export async function reinforceRule(subject: string, object: string): Promise<void> {
  await db.craftRule.upsert({
    where:  { subject_relation_object: { subject, relation: 'pairs_with', object } },
    update: { reinforceCount: { increment: 1 }, confidence: { increment: 0.05 } },
    create: { subject, relation: 'pairs_with', object, confidence: 0.6, source: 'learned' },
  }).catch(() => {})
}
```

**Use in the Affective Director** (`affect.ts`) — enrich the arc with craft rules:

```typescript
import { recommendCraft } from './knowledgeGraph'

// When designing the arc, pull craft recommendations for the target emotion:
const craft = await recommendCraft(intent.targetEmotion, 2)
// Add to the Claude prompt: `Proven craft pairings for ${intent.targetEmotion}: ${craft.join(', ')}`
```

---

## ENHANCEMENT 6 — SEED PRESERVATION

Store generation seeds so a past look can be reproduced exactly.

**Edit** `recordEpisode` calls to include seeds in the outcome:

```typescript
// When a segment generates, capture its seed (FAL returns it in the response):
await recordEpisode({
  userId, kind: 'scene',
  summary: `${shot.contentType}: ${shot.visualPrompt.slice(0, 60)}`,
  brief: { model: node.assignedModel, seed: result.seed, payload: input },
  outcome: { qualityScore: seg.qualityScore },
  importance: seg.qualityScore,   // good scenes are more important to remember
})
```

When recalling for "make it like that project," pass the stored seed back into the payload via
`buildPayload` (add `seed` to the intent if the schema accepts it).

---

## SUMMARY — FILES

| Enhancement | File | Action |
|---|---|---|
| 1 Live matrix | `prisma` ModelPerformance | NEW |
| 1 | `src/lib/cognition/performance.ts` | NEW |
| 1 | `dagRouter.ts` | EDIT — live scoring + circuit breaker |
| 1 | `bridgedGeneration.ts` | EDIT — record latency/success |
| 2 Schema payloads | `src/lib/cognition/schemaPayload.ts` | NEW |
| 2 | `bridgedGeneration.ts` | EDIT — use buildPayload |
| 3 Continuity | `src/lib/cognition/continuity.ts` | NEW |
| 3 | `parallelGeneration.ts` | EDIT — thread continuity |
| 4 Rewards | `prisma` RewardSignal | NEW |
| 4 | `src/app/api/feedback/signal/route.ts` | NEW |
| 4 | frontend export/regenerate buttons | EDIT — fire signals |
| 5 Knowledge graph | `prisma` CraftRule | NEW |
| 5 | `src/lib/cognition/knowledgeGraph.ts` | NEW |
| 5 | `affect.ts` | EDIT — craft recommendations |
| 6 Seeds | `bridgedGeneration.ts` + memory | EDIT — store/recall seeds |

```bash
npx prisma migrate dev --name cognitive_enhancements
npx prisma generate
npx tsc --noEmit
```

---

## WHY THESE MATTER MOST

- **Live Performance Matrix** auto-solves the slow-Wan problem and any future model that
  degrades — routing adapts in real time, with a circuit breaker that drops dead models.
- **Schema-Driven Payloads** is the permanent fix for the stale-endpoint build failures —
  the payload conforms to whatever the model actually accepts.
- **Continuity State** is the consistency upgrade — wardrobe and props finally persist across
  cuts, which keyframe bridging alone couldn't guarantee.
- **Reward Signals** close the loop Gemini emphasised: the system learns from what users keep
  vs regenerate, not just from automated scores — true RLAIF.

Together these turn the Cognitive Director from "smart planner" into "self-optimising studio"
that gets faster, more reliable, and more on-taste with every film.
