# CINEMATIC FORGE — THE COGNITIVE DIRECTOR
## Cursor Agent Prompt
### A cognitive architecture for the orchestrator: intent · emotion · imagination · memory · learning

---

## HONEST FRAMING (read first)

This is **not** machine consciousness — that is not a solved problem and claiming it would be
dishonest. What this IS: a **cognitive architecture** that produces the *behaviors* you want —
understanding intent, reasoning about emotion and rhythm, imagining captivating scenes,
learning which models to call, and remembering across projects. It is grounded in the current
state of the art: the **CoALA framework** (Cognitive Architectures for Language Agents,
Princeton, the field-standard memory taxonomy), **Reflexion** (self-critique), **Tree of
Thoughts** (branching creative reasoning), **memory consolidation** (episodic→semantic), and
**selective forgetting** (temporal decay + importance weighting).

The result behaves like a thinking creative director sitting above your model orchestra. It
does not "feel" — but it reasons explicitly about emotional arc, pacing, and intent, and it
gets measurably better the more it's used.

---

## ARCHITECTURE — THE COGNITIVE DIRECTOR

```
USER PROMPT
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  COGNITIVE DIRECTOR (the "mind" above the orchestra)                  │
│                                                                       │
│  1. INTENT MODELER    — what does the user REALLY want? (goal, mood,  │
│                          references, audience, unstated needs)        │
│  2. MEMORY RECALL     — retrieve relevant past projects + learnings   │
│                          (RAG over episodic + semantic memory)        │
│  3. AFFECTIVE DIRECTOR — design the emotional arc + rhythm + pacing    │
│  4. CREATIVE IDEATOR  — Tree-of-Thoughts: branch several creative      │
│                          directions, score, pick the most captivating │
│  5. REFLECTIVE CRITIC — critique the plan before spending compute;     │
│                          revise weak beats (Reflexion loop)           │
│                          ↓ produces an enriched CREATIVE BRIEF         │
└──────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION V2 (existing) — breakdown → DAG → generate → stitch    │
│  now guided by the creative brief + procedural routing memory         │
└──────────────────────────────────────────────────────────────────────┘
   │
   ▼  (after render)
┌──────────────────────────────────────────────────────────────────────┐
│  LEARNING LOOP (background)                                            │
│  6. MEMORY CONSOLIDATOR — episodic → semantic (distil what worked)     │
│  7. PROCEDURAL LEARNER  — update routing policies from quality scores  │
└──────────────────────────────────────────────────────────────────────┘
```

### CoALA's four memory stores (mapped to your stack)

| Memory | Holds | Store |
|---|---|---|
| **Working** | current project session | Redis (fast, ephemeral) |
| **Episodic** | every past project + outcome | Postgres + pgvector |
| **Semantic** | distilled knowledge, user taste, what works | Postgres + pgvector |
| **Procedural** | learned model-routing policies | Postgres (relational) |

---

## STEP 1 — pgvector SETUP

Your Postgres gains vector search. **Run:**

```sql
-- Enable the vector extension (Postgres 15+ / Supabase / Neon support this)
CREATE EXTENSION IF NOT EXISTS vector;
```

If on a managed host (Neon/Supabase/Railway Postgres), enable `pgvector` in the dashboard, or
run the SQL above via `psql $DATABASE_URL`.

---

## STEP 2 — MEMORY SCHEMA

**Add to** `prisma/schema.prisma`:

```prisma
// ── Episodic memory: every creative decision + its outcome ────────────────
model EpisodicMemory {
  id            String   @id @default(cuid())
  userId        String
  projectId     String?
  kind          String   // 'project' | 'scene' | 'routing_decision' | 'feedback'
  summary       String   // human-readable description of the episode
  intent        Json?    // the parsed intent at the time
  brief         Json?    // the creative brief produced
  outcome       Json?    // quality scores, user rating, what happened
  embedding     Unsupported("vector(1024)")?   // semantic embedding for RAG
  importance    Float    @default(0.5)          // 0-1, drives selective forgetting
  accessCount   Int      @default(0)            // recency/frequency for decay
  lastAccessed  DateTime @default(now())
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([kind])
}

// ── Semantic memory: consolidated, generalised knowledge ──────────────────
model SemanticMemory {
  id            String   @id @default(cuid())
  userId        String?  // null = global knowledge; set = user-specific taste
  category      String   // 'user_taste' | 'craft_rule' | 'model_insight' | 'genre_pattern'
  insight       String   // e.g. "User prefers slow cinematic pacing with warm grades"
  evidence      Json?    // episodes this was distilled from
  confidence    Float    @default(0.5)
  embedding     Unsupported("vector(1024)")?
  reinforceCount Int     @default(1)            // times this insight was confirmed
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([userId])
  @@index([category])
}

// ── Procedural memory: learned model-routing policies ─────────────────────
model RoutingPolicy {
  id            String   @id @default(cuid())
  contentType   String   // e.g. 'physical_action'
  model         String   // e.g. 'kling-3.0'
  successRate   Float    @default(0.5)          // rolling avg quality score 0-1
  sampleCount   Int      @default(0)
  avgGenSeconds Float    @default(60)
  lastUpdated   DateTime @default(now())
  @@unique([contentType, model])
  @@index([contentType])
}
```

**Add to User:**
```prisma
episodicMemories EpisodicMemory[]
```

```bash
npx prisma migrate dev --name cognitive_memory
npx prisma generate
```

> Note: Prisma's `Unsupported("vector(1024)")` lets the column exist; vector queries run via
> raw SQL (`$queryRaw`) shown in STEP 3.

---

## STEP 3 — EMBEDDINGS + MEMORY SERVICE

**Create** `src/lib/cognition/memory.ts`:

```typescript
// src/lib/cognition/memory.ts
// CoALA memory: write/recall episodic + semantic with vector RAG + selective forgetting

import { db } from '@/lib/db'

// Embeddings via Voyage AI (Anthropic's recommended embeddings partner).
// Set VOYAGE_API_KEY. Swap for any provider returning a 1024-dim vector.
export async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: 'voyage-3', input: text, output_dimension: 1024 }),
  }).then(r => r.json())
  return res.data?.[0]?.embedding ?? new Array(1024).fill(0)
}

// ── Write an episode ──────────────────────────────────────────────────────
export async function recordEpisode(params: {
  userId:    string
  projectId?: string
  kind:      string
  summary:   string
  intent?:   any
  brief?:    any
  outcome?:  any
  importance?: number
}): Promise<void> {
  const vec = await embed(`${params.summary} ${JSON.stringify(params.intent ?? '')}`)
  // Insert with vector via raw SQL (Prisma can't bind vector type directly)
  await db.$executeRaw`
    INSERT INTO "EpisodicMemory" (id, "userId", "projectId", kind, summary, intent, brief, outcome, embedding, importance, "createdAt", "lastAccessed")
    VALUES (gen_random_uuid()::text, ${params.userId}, ${params.projectId ?? null}, ${params.kind},
            ${params.summary}, ${JSON.stringify(params.intent ?? {})}::jsonb, ${JSON.stringify(params.brief ?? {})}::jsonb,
            ${JSON.stringify(params.outcome ?? {})}::jsonb, ${'[' + vec.join(',') + ']'}::vector,
            ${params.importance ?? 0.5}, now(), now())
  `
}

// ── Recall relevant episodes (RAG) ────────────────────────────────────────
export async function recallEpisodes(userId: string, query: string, limit = 5): Promise<any[]> {
  const vec = await embed(query)
  const rows = await db.$queryRaw<any[]>`
    SELECT id, summary, intent, brief, outcome, importance,
           1 - (embedding <=> ${'[' + vec.join(',') + ']'}::vector) AS similarity
    FROM "EpisodicMemory"
    WHERE "userId" = ${userId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${'[' + vec.join(',') + ']'}::vector
    LIMIT ${limit}
  `
  // Bump access stats (recency/frequency for forgetting)
  if (rows.length) {
    await db.$executeRaw`
      UPDATE "EpisodicMemory" SET "accessCount" = "accessCount" + 1, "lastAccessed" = now()
      WHERE id = ANY(${rows.map(r => r.id)})
    `
  }
  return rows
}

// ── Recall semantic knowledge (user taste + craft rules) ──────────────────
export async function recallSemantic(userId: string, query: string, limit = 5): Promise<any[]> {
  const vec = await embed(query)
  return db.$queryRaw<any[]>`
    SELECT insight, category, confidence
    FROM "SemanticMemory"
    WHERE ("userId" = ${userId} OR "userId" IS NULL) AND embedding IS NOT NULL
    ORDER BY embedding <=> ${'[' + vec.join(',') + ']'}::vector
    LIMIT ${limit}
  `
}

// ── Selective forgetting: decay importance, prune cold low-value memories ─
export async function runForgetting(): Promise<void> {
  // Temporal decay: importance fades unless reinforced by access
  await db.$executeRaw`
    UPDATE "EpisodicMemory"
    SET importance = GREATEST(0, importance - 0.01 * EXTRACT(DAY FROM now() - "lastAccessed") / 30)
    WHERE kind != 'feedback'
  `
  // Prune: forget cold, low-importance, rarely-accessed episodes
  await db.$executeRaw`
    DELETE FROM "EpisodicMemory"
    WHERE importance < 0.1 AND "accessCount" < 2 AND "createdAt" < now() - interval '90 days'
  `
}
```

---

## STEP 4 — INTENT MODELER

**Create** `src/lib/cognition/intent.ts`:

```typescript
// src/lib/cognition/intent.ts
// Understand what the user REALLY wants — beyond the literal prompt

import { recallSemantic } from './memory'

export interface Intent {
  literalRequest:  string
  inferredGoal:    string      // what they're really trying to achieve
  targetEmotion:   string      // the feeling the film should evoke
  audience:        string      // who it's for
  references:      string[]    // implied stylistic references
  unstatedNeeds:   string[]    // things they didn't say but probably want
  energyLevel:     'calm' | 'building' | 'high' | 'explosive'
  confidence:      number      // how sure we are about the inference
}

export async function modelIntent(userId: string, prompt: string): Promise<Intent> {
  // Pull the user's known taste from semantic memory to inform inference
  const taste = await recallSemantic(userId, prompt, 5)
  const tasteContext = taste.length
    ? `Known preferences for this user:\n${taste.map(t => `- ${t.insight}`).join('\n')}`
    : 'No prior preferences known yet.'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are a perceptive creative director. Read beneath the surface of a video
request to understand true intent — the goal, the feeling, the unspoken needs. Consider the
user's known preferences. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Request: "${prompt}"

${tasteContext}

Infer the deeper intent. Return JSON:
{
  "literalRequest": "what they literally asked for",
  "inferredGoal": "what they're really trying to achieve",
  "targetEmotion": "the dominant feeling the film should evoke",
  "audience": "who this is likely for",
  "references": ["implied stylistic or tonal references"],
  "unstatedNeeds": ["things they didn't say but likely want"],
  "energyLevel": "calm|building|high|explosive",
  "confidence": 0.0-1.0
}`,
      }],
    }),
  }).then(r => r.json())

  try {
    return JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim())
  } catch {
    return {
      literalRequest: prompt, inferredGoal: prompt, targetEmotion: 'neutral',
      audience: 'general', references: [], unstatedNeeds: [], energyLevel: 'building', confidence: 0.3,
    }
  }
}
```

---

## STEP 5 — AFFECTIVE DIRECTOR (emotional arc + rhythm)

**Create** `src/lib/cognition/affect.ts`:

```typescript
// src/lib/cognition/affect.ts
// Design the emotional arc and rhythmic pacing of the film

import type { Intent } from './intent'

export interface EmotionalBeat {
  position:   number    // 0-1 along the timeline
  emotion:    string     // the feeling at this point
  intensity:  number     // 0-1
  pacing:     'lingering' | 'measured' | 'brisk' | 'rapid'
  purpose:    string     // why this beat exists in the arc
}

export interface EmotionalArc {
  shape:       string          // 'rising' | 'rise_fall' | 'fall_rise' | 'steady_build' | 'rollercoaster'
  beats:       EmotionalBeat[]
  rhythmNote:  string          // overall rhythmic intention for the editor
}

export async function designEmotionalArc(intent: Intent, durationSec: number): Promise<EmotionalArc> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a film editor and composer who thinks in emotional rhythm. Design the
felt experience of a film over time — where it breathes, where it accelerates, where it lands.
Pacing is a craft: lingering shots build weight, rapid cuts build energy. Return ONLY JSON.`,
      messages: [{
        role: 'user',
        content: `Film intent:
- Goal: ${intent.inferredGoal}
- Target emotion: ${intent.targetEmotion}
- Energy: ${intent.energyLevel}
- Duration: ${durationSec}s

Design the emotional arc. Return JSON:
{
  "shape": "rising|rise_fall|fall_rise|steady_build|rollercoaster",
  "rhythmNote": "one sentence on the overall rhythmic intention",
  "beats": [
    { "position": 0.0-1.0, "emotion": "...", "intensity": 0.0-1.0,
      "pacing": "lingering|measured|brisk|rapid", "purpose": "..." }
  ]
}
Use 3-6 beats that sum to a satisfying emotional journey.`,
      }],
    }),
  }).then(r => r.json())

  try {
    return JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim())
  } catch {
    return { shape: 'steady_build', rhythmNote: 'Even, building pace', beats: [] }
  }
}
```

---

## STEP 6 — CREATIVE IDEATOR (Tree of Thoughts)

**Create** `src/lib/cognition/ideate.ts`:

```typescript
// src/lib/cognition/ideate.ts
// Tree of Thoughts: branch several creative directions, score, pick the most captivating

import type { Intent } from './intent'
import type { EmotionalArc } from './affect'

export interface CreativeDirection {
  concept:     string       // the core creative idea
  visualStyle: string
  scenes:      string[]      // scene concepts that realise it
  novelty:     number        // 0-1 how fresh/captivating
  feasibility: number        // 0-1 how achievable with available models
  score:       number        // combined
}

export async function ideate(
  intent:    Intent,
  arc:       EmotionalArc,
  pastWins:  string[]        // summaries of past successful projects (from episodic memory)
): Promise<CreativeDirection> {

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1600,
      system: `You are a visionary creative director. Generate MULTIPLE distinct creative
directions for a film, then critically evaluate each for how captivating AND achievable it is,
and select the strongest. Avoid the obvious. Surprise within the bounds of the intent.
Return ONLY JSON.`,
      messages: [{
        role: 'user',
        content: `Intent: ${intent.inferredGoal}
Target emotion: ${intent.targetEmotion}
Emotional arc: ${arc.shape} — ${arc.rhythmNote}
${pastWins.length ? `What worked before for this user:\n${pastWins.map(w => `- ${w}`).join('\n')}` : ''}

Generate 3 distinct creative directions (Tree of Thoughts). Score each on novelty (fresh,
captivating) and feasibility (achievable with current AI video models). Then return the SINGLE
best as JSON:
{
  "concept": "the winning core idea",
  "visualStyle": "the look and feel",
  "scenes": ["scene concept 1", "scene concept 2", "..."],
  "novelty": 0.0-1.0,
  "feasibility": 0.0-1.0,
  "score": 0.0-1.0
}`,
      }],
    }),
  }).then(r => r.json())

  try {
    return JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim())
  } catch {
    return { concept: intent.inferredGoal, visualStyle: 'cinematic', scenes: [], novelty: 0.5, feasibility: 0.8, score: 0.65 }
  }
}
```

---

## STEP 7 — REFLECTIVE CRITIC (Reflexion loop)

**Create** `src/lib/cognition/reflect.ts`:

```typescript
// src/lib/cognition/reflect.ts
// Critique the creative plan BEFORE spending compute; revise weak beats

import type { CreativeDirection } from './ideate'
import type { EmotionalArc } from './affect'

export async function critiqueAndRefine(
  direction: CreativeDirection,
  arc:       EmotionalArc,
  intent:    string
): Promise<CreativeDirection> {

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1400,
      system: `You are a ruthless but constructive script editor. Critique a creative plan for
weaknesses — clichés, emotional flatness, pacing problems, scenes that won't land — then return
an IMPROVED version. Be honest about flaws; the goal is the strongest possible film. Return ONLY JSON.`,
      messages: [{
        role: 'user',
        content: `Intent: ${intent}
Emotional arc: ${arc.shape}
Plan: ${JSON.stringify(direction)}

Critique it (note specific weaknesses), then return the improved plan as the same JSON shape:
{ "concept", "visualStyle", "scenes": [...], "novelty", "feasibility", "score" }
Keep what works; fix what's weak. Raise the emotional impact.`,
      }],
    }),
  }).then(r => r.json())

  try {
    return JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim())
  } catch {
    return direction   // if critique fails, proceed with original
  }
}
```

---

## STEP 8 — THE COGNITIVE DIRECTOR (main entry)

**Create** `src/lib/cognition/index.ts`:

```typescript
// src/lib/cognition/index.ts
// The mind above the orchestra — runs before orchestration V2

import { modelIntent }        from './intent'
import { recallEpisodes }     from './memory'
import { designEmotionalArc } from './affect'
import { ideate }             from './ideate'
import { critiqueAndRefine }  from './reflect'
import { recordEpisode }      from './memory'

export interface CreativeBrief {
  intent:        any
  emotionalArc:  any
  direction:     any           // the refined creative direction
  enrichedPrompt: string       // the prompt that feeds orchestration V2
}

export async function think(params: {
  userId:      string
  prompt:      string
  durationSec: number
  onProgress?: (stage: string, detail: string) => void
}): Promise<CreativeBrief> {
  const { userId, prompt, durationSec, onProgress } = params

  // 1. Understand intent
  onProgress?.('thinking', 'Understanding what you really want...')
  const intent = await modelIntent(userId, prompt)

  // 2. Recall relevant past work (RAG)
  onProgress?.('thinking', 'Recalling what worked before...')
  const episodes = await recallEpisodes(userId, intent.inferredGoal, 5)
  const pastWins = episodes
    .filter(e => (e.outcome?.qualityScore ?? 0) > 0.7)
    .map(e => e.summary)

  // 3. Design the emotional arc + rhythm
  onProgress?.('thinking', 'Composing the emotional rhythm...')
  const emotionalArc = await designEmotionalArc(intent, durationSec)

  // 4. Imagine creative directions (Tree of Thoughts)
  onProgress?.('thinking', 'Imagining captivating scenes...')
  let direction = await ideate(intent, emotionalArc, pastWins)

  // 5. Reflect + refine (only if there's room to improve)
  if (direction.score < 0.85) {
    onProgress?.('thinking', 'Refining the vision...')
    direction = await critiqueAndRefine(direction, emotionalArc, intent.inferredGoal)
  }

  // Build the enriched prompt that orchestration V2 will break down
  const enrichedPrompt = [
    direction.concept,
    `Visual style: ${direction.visualStyle}.`,
    `Emotional journey: ${emotionalArc.shape} — ${emotionalArc.rhythmNote}.`,
    `Scenes: ${direction.scenes.join(' / ')}.`,
    `Evoke: ${intent.targetEmotion}.`,
  ].join(' ')

  // Record this as an episode (outcome filled in later by the learning loop)
  await recordEpisode({
    userId, kind: 'project',
    summary: `${intent.inferredGoal} — ${direction.concept}`,
    intent, brief: { emotionalArc, direction }, importance: 0.6,
  }).catch(() => {})

  return { intent, emotionalArc, direction, enrichedPrompt }
}
```

---

## STEP 9 — LEARNING LOOP (consolidation + procedural learning)

**Create** `src/lib/cognition/learn.ts`:

```typescript
// src/lib/cognition/learn.ts
// Background learning: distil episodic→semantic, update routing policies from outcomes

import { db } from '@/lib/db'
import { embed } from './memory'

// ── Procedural learning: update model routing success rates from quality scores ─
export async function updateRoutingPolicy(
  contentType: string,
  model:       string,
  qualityScore: number,
  genSeconds:  number
): Promise<void> {
  const existing = await db.routingPolicy.findUnique({
    where: { contentType_model: { contentType, model } },
  }).catch(() => null)

  if (existing) {
    // Rolling average — the policy learns which model truly performs per content type
    const n = existing.sampleCount
    const newRate = (existing.successRate * n + qualityScore) / (n + 1)
    const newTime = (existing.avgGenSeconds * n + genSeconds) / (n + 1)
    await db.routingPolicy.update({
      where: { contentType_model: { contentType, model } },
      data:  { successRate: newRate, sampleCount: n + 1, avgGenSeconds: newTime, lastUpdated: new Date() },
    })
  } else {
    await db.routingPolicy.create({
      data: { contentType, model, successRate: qualityScore, sampleCount: 1, avgGenSeconds: genSeconds },
    })
  }
}

// The DAG router can now consult learned policies — best-performing model per content type
export async function getLearnedBestModel(contentType: string, pool: string[]): Promise<string | null> {
  const policies = await db.routingPolicy.findMany({
    where:   { contentType, model: { in: pool } },
    orderBy: { successRate: 'desc' },
  })
  // Only trust a policy with enough samples
  const trusted = policies.find(p => p.sampleCount >= 5)
  return trusted?.model ?? null
}

// ── Memory consolidation: distil patterns across episodes into semantic insights ─
export async function consolidateMemory(userId: string): Promise<void> {
  // Pull recent high-importance episodes
  const episodes = await db.$queryRaw<any[]>`
    SELECT summary, intent, outcome FROM "EpisodicMemory"
    WHERE "userId" = ${userId} AND importance > 0.5
    ORDER BY "createdAt" DESC LIMIT 30
  `
  if (episodes.length < 5) return   // need enough signal

  // Ask Claude to find patterns → user taste / craft rules
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `Find recurring patterns across a user's film projects. Distil them into durable
insights about their taste and what works. Return ONLY a JSON array of insights.`,
      messages: [{
        role: 'user',
        content: `Episodes:\n${episodes.map(e => `- ${e.summary} (outcome: ${JSON.stringify(e.outcome)})`).join('\n')}

Return JSON array:
[{ "category": "user_taste|craft_rule|genre_pattern", "insight": "durable generalisation", "confidence": 0.0-1.0 }]`,
      }],
    }),
  }).then(r => r.json())

  let insights: any[] = []
  try { insights = JSON.parse(res.content?.[0]?.text?.replace(/```json|```/g, '').trim() ?? '[]') } catch {}

  // Store / reinforce each insight in semantic memory
  for (const ins of insights) {
    const vec = await embed(ins.insight)
    await db.$executeRaw`
      INSERT INTO "SemanticMemory" (id, "userId", category, insight, confidence, embedding, "reinforceCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userId}, ${ins.category}, ${ins.insight}, ${ins.confidence},
              ${'[' + vec.join(',') + ']'}::vector, 1, now(), now())
    `.catch(() => {})
  }
}
```

---

## STEP 10 — WIRE INTO ORCHESTRATION + WORKER

### 10a — Generate route runs cognition first

**Edit** `src/app/api/generate/route.ts` (director mode) — think before queuing:

```typescript
// For director mode, the worker will run cognition. Just queue with a flag:
await renderQueue.add('orchestrate', {
  jobId: job.id, userId, prompt, duration, selectedModels,
  useCognition: true,   // ← enable the Cognitive Director
})
```

### 10b — Worker runs cognition → enriched brief → orchestration

**Edit** `src/workers/index.ts` orchestration handler:

```typescript
import { think } from '@/lib/cognition'
import { updateRoutingPolicy, consolidateMemory } from '@/lib/cognition/learn'
import { recordEpisode } from '@/lib/cognition/memory'

// Inside the orchestrate worker, BEFORE orchestrateGeneration:
let finalPrompt = prompt
if (job.data.useCognition) {
  await db.renderJob.update({ where: { id: jobId }, data: { phase: 'thinking', statusMessage: 'The director is thinking...' } })
  const brief = await think({
    userId, prompt, durationSec: duration,
    onProgress: async (stage, detail) => {
      await db.renderJob.update({ where: { id: jobId }, data: { statusMessage: detail } }).catch(() => {})
    },
  })
  finalPrompt = brief.enrichedPrompt   // ← orchestration breaks down the ENRICHED prompt
}

const result = await orchestrateGeneration({ prompt: finalPrompt, totalDuration: duration, selectedModels, userId, onProgress: /* ... */ })

// ── After render: feed outcomes back into learning ───────────────────────
for (const seg of result.segments) {
  // (need contentType per segment — store it on the segment in orchestration)
  await updateRoutingPolicy(seg.contentType ?? 'unknown', seg.model, seg.qualityScore, 60).catch(() => {})
}
await recordEpisode({
  userId, projectId: jobId, kind: 'feedback',
  summary: `Rendered: ${finalPrompt.slice(0, 80)}`,
  outcome: { qualityScores: result.qualityScores, avgQuality: avg(Object.values(result.qualityScores)) },
  importance: 0.7,
}).catch(() => {})

// Consolidate memory occasionally (every ~10th project)
if (Math.random() < 0.1) consolidateMemory(userId).catch(() => {})
```

### 10c — DAG router consults learned policy (Priority 0.5)

**Edit** `src/lib/orchestration/dagRouter.ts` `selectModel` — between Claude's suggestion and the static matrix:

```typescript
import { getLearnedBestModel } from '@/lib/cognition/learn'

// Make selectModel async, and add after Priority 0 (Claude suggestion):
// Priority 0.5 — learned policy: the model that has actually performed best
const learned = await getLearnedBestModel(shot.contentType, availablePool)
if (learned) return learned
// ... then Priority 1 (static matrix), Priority 2 (cheapest)
```

> The router now improves with every render — models that consistently score well get chosen
> more, models that disappoint get chosen less. That's the reinforcement loop.

---

## STEP 11 — FORGETTING + CONSOLIDATION CRON

**Add to** `src/workers/index.ts` — periodic memory hygiene:

```typescript
import { runForgetting } from '@/lib/cognition/memory'

// Run selective forgetting daily
setInterval(() => { runForgetting().catch(e => console.warn('[forgetting]', e.message)) }, 86_400_000)
```

---

## STEP 12 — ENV

```env
VOYAGE_API_KEY=    # embeddings — voyageai.com (Anthropic's recommended partner)
                   # or swap embed() for any 1024-dim embedding provider
```

---

## WHAT THIS ACTUALLY DELIVERS

| You asked for | What it does |
|---|---|
| "Understand the user's intent" | Intent Modeler infers goal, emotion, audience, unstated needs |
| "Sense of emotion, excitement, rhythm" | Affective Director composes an emotional arc with pacing beats |
| "Imagine the ideas" | Creative Ideator branches directions (Tree of Thoughts), picks the most captivating |
| "Plan captivating storyboards" | Refined creative direction feeds the existing storyboard pass |
| "Segment & optimise which models when" | DAG router + learned RoutingPolicy improve routing every render |
| "Constantly learning, RAG, persistent memory" | CoALA 4-memory system on pgvector; consolidation distils episodic→semantic |
| "SOA mindset, functional studio" | Reflexion self-critique + memory consolidation + procedural learning = it gets better with use |

---

## SUMMARY — FILES

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | EpisodicMemory, SemanticMemory, RoutingPolicy + pgvector |
| `src/lib/cognition/memory.ts` | embeddings, episodic/semantic RAG, selective forgetting |
| `src/lib/cognition/intent.ts` | deep intent modeling |
| `src/lib/cognition/affect.ts` | emotional arc + rhythm design |
| `src/lib/cognition/ideate.ts` | Tree-of-Thoughts creative ideation |
| `src/lib/cognition/reflect.ts` | Reflexion self-critique loop |
| `src/lib/cognition/index.ts` | the Cognitive Director (main entry) |
| `src/lib/cognition/learn.ts` | procedural learning + memory consolidation |
| `src/app/api/generate/route.ts` | enable cognition flag |
| `src/workers/index.ts` | run cognition → enriched brief → learning feedback |
| `src/lib/orchestration/dagRouter.ts` | consult learned routing policy |

---

## VERIFICATION

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
npx prisma migrate dev --name cognitive_memory
npx tsc --noEmit

# Generate twice with similar prompts — the second should recall the first
curl -X POST http://localhost:3000/api/generate -H "x-user-id: test" \
  -d '{"prompt":"a tense noir chase through rainy streets","duration":20,"mode":"director","selectedModels":["kling-3.0","luma-ray3"]}'
# Watch worker logs: "The director is thinking..." → intent → arc → ideation → refine

# Check memory was written:
psql $DATABASE_URL -c 'SELECT kind, summary, importance FROM "EpisodicMemory" LIMIT 5;'
# After several renders, semantic insights appear:
psql $DATABASE_URL -c 'SELECT category, insight, confidence FROM "SemanticMemory" LIMIT 5;'
# Routing policies build up:
psql $DATABASE_URL -c 'SELECT "contentType", model, "successRate", "sampleCount" FROM "RoutingPolicy" ORDER BY "successRate" DESC;'
```

---

## HONEST LIMITS

- This produces intelligent *behavior* and *improvement over time* — not sentience or feeling.
- The "emotion" is explicit reasoning about emotional craft, not subjective experience.
- Learning needs volume: routing policies need ~5+ samples per content-type/model to be trusted;
  semantic insights sharpen after ~10+ projects. It starts good (Claude's reasoning) and gets
  better (accumulated memory).
- Every cognition step is a Claude call — adds ~10-20s and some cost per project before render.
  Worth it for hero projects; you may want to make it toggleable (the `useCognition` flag) so
  quick drafts skip it.
