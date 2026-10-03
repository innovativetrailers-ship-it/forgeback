# SPEC PHASE 3 — COGNITIVE DIRECTOR + MoE ROUTING PIPELINE
## The moat. Currently UNBUILT. Specced as contracts that slot BEHIND the Stage 1
## and Stage 2 interfaces (Phase 2) — so it lands incrementally, manual mode stays
## as override, and nothing downstream rewires. Imports types from Phase 1.

## KEY DESIGN PRINCIPLE — everything here is ADDITIVE and BYPASSABLE
## - Cognitive Director produces an enriched CreativeBrief → fed to Stage 1 breakdown.
## - MoE Router writes Shot.selectedModelId (only when modelOverride=false).
## - If cognition is OFF or a stage fails → fall back to v1 minimal (raw prompt,
##   manual model). The pipeline NEVER hard-depends on cognition.
## - Ship order: build the interfaces as pass-throughs first, fill each stage later.

═══════════════════════════════════════════════════════════════════════
# PART 1 — THE COGNITIVE DIRECTOR (5 stages → enriched brief)
═══════════════════════════════════════════════════════════════════════
Runs BEFORE Stage 1 breakdown. Input: raw user prompt + memory. Output: enriched
CreativeBrief. Each stage is a claudeCall() with a defined contract.

TOP-LEVEL CONTRACT:
```typescript
cognitiveDirector(input: { rawPrompt: string, projectId: string, userId: string }, ctx)
  : Promise<CreativeBrief>
// Orchestrates the 5 stages below, each bypassable. Returns enriched brief.
// On any stage failure → returns the brief built so far (graceful degrade),
// worst case { rawPrompt, enrichedPrompt: rawPrompt } (== v1 minimal).
```

── STAGE C1 — INTENT MODELING ──
```typescript
interface IntentModel {
  inferredGoal: string          // "isolation, melancholy, scale contrast"
  targetEmotion: string         // "existential wonder mixed with grief"
  audience: string              // "arthouse / festival"
  unstatedNeeds: string[]       // ["silence should dominate","cold desaturated"]
  energyLevel: 'slow-building'|'steady'|'high'|'volatile'
  impliedReferences: string[]   // ["2001","Gravity","Interstellar"]
}
intentModel(rawPrompt: string, semanticMemory: SemanticInsight[], ctx): Promise<IntentModel>
```
LOGIC: one claudeCall (source='cognitive.intent'). System prompt: analyze the
prompt for underlying intent; incorporate the user's semantic-memory taste
insights (from Part 3). Output strict JSON IntentModel.
BYPASS: if disabled → intent=undefined; brief.enrichedPrompt=rawPrompt.

── STAGE C2 — EMOTIONAL ARC DESIGN ──
```typescript
interface EmotionalArc {
  shape: 'rising'|'rise-fall'|'fall-rise'|'steady-build'|'rollercoaster'
  beats: { position: number, intensity: number, pacing: 'lingering'|'measured'|'brisk'|'rapid' }[]
  rhythmicIntention: string     // "breathes slowly into violence, then lingers"
}
emotionalArc(intent: IntentModel, ctx): Promise<EmotionalArc>
```
LOGIC: one claudeCall (source='cognitive.arc'). Maps the felt journey. The beat
pacing later influences shot composition in Stage 1 (slow beats → wider/atmospheric,
rapid → tighter/closer). This is a DATA output consumed by breakdown.

── STAGE C3 — CREATIVE IDEATION (Tree of Thoughts) ──
```typescript
interface CreativeDirection { id: string; description: string; novelty: number; feasibility: number }
ideate(intent: IntentModel, arc: EmotionalArc, ctx): Promise<CreativeDirection>  // returns the WINNER
```
LOGIC: one claudeCall generates 3 distinct directions (A/B/C), scores each
novelty×feasibility, returns the strongest. Prevents defaulting to the obvious.
BYPASS: if disabled → skip; brief uses intent+arc only.

── STAGE C4 — REFLEXION SELF-CRITIQUE ──
```typescript
interface Critique { score: number; issues: string[]; revisedBrief?: string }
reflexion(draftBrief: CreativeBrief, ctx): Promise<Critique>
```
LOGIC: one claudeCall reviews the assembled brief for clichés, emotional flatness,
model-infeasible scenes, pacing monotony. If score < threshold (e.g. 6) → returns
a revisedBrief; the director loops ONCE with the revision. Bounded: max 1 revision
(no infinite reflexion — the agent-loop cap from the billing fixes).
CRITICAL: this runs BEFORE any credit is spent (before Stage 1 breakdown → before
generation). It's the "catch the bad plan" gate.

── STAGE C5 — ENRICHED BRIEF ASSEMBLY ──
```typescript
assembleBrief(intent, arc, direction, critique): CreativeBrief
// Deterministic merge (no LLM call) → the CreativeBrief that Stage 1 receives.
```

COGNITIVE DIRECTOR CURSOR PROMPT:
```
Implement cognitiveDirector() per spec-3 Part 1. Five stages, each a claudeCall
with ctx.source='cognitive.<stage>' and strict-JSON zod-validated output. Each
stage BYPASSABLE via a per-stage feature flag; on failure, degrade gracefully to
the partial brief (worst case rawPrompt). Reflexion loops at most ONCE (bounded).
The whole director runs BEFORE Stage 1 breakdown and BEFORE any generation. Output
CreativeBrief feeds Stage 1 unchanged. Build the orchestrator + interfaces FIRST as
pass-throughs (return rawPrompt brief), then fill each stage.
```

═══════════════════════════════════════════════════════════════════════
# PART 2 — THE MoE ROUTER (per-shot model selection)
═══════════════════════════════════════════════════════════════════════
This is the "MoE pipeline" — a gating function that selects the best expert
(model) per shot. Writes Shot.selectedModelId ONLY when modelOverride=false.
Slots behind Stage 2 (Phase 2): Stage 2 always just READS selectedModelId.

TOP-LEVEL CONTRACT:
```typescript
routeShot(shot: Shot, pool: ModelDef[], ctx): Promise<{ modelId: string, rationale: string }>
// Called during DAG routing when modelOverride=false. Writes selectedModelId.
```

── 2a. THE 9-DIMENSION SHOT ANALYSIS (the gate's input features) ──
```typescript
interface ShotAnalysis {
  sceneType: 'dialogue'|'action'|'nature'|'product'|'aerial'|'abstract'|'vfx'
  humanPresence: 'none'|'background'|'foreground'|'close_up'|'dialogue'
  physicsType: 'none'|'fluid'|'fire'|'smoke'|'crowd'|'cloth'|'rigid_body'
  duration: 'short'|'medium'|'long'
  audioType: 'none'|'ambient'|'dialogue'|'music'|'sfx'|'native-audio-required'
  qualityTier: 'draft'|'studio'|'blockbuster'
  consistencyId: string | null  // character_A / location_B cross-shot linking
  hasTextOnScreen: boolean
  styleKey: 'cinematic'|'documentary'|'commercial'|'animation'|'news'
}
analyzeShot(shot: Shot, ctx): Promise<ShotAnalysis>   // one claudeCall, source='route.analyze'
```

── 2b. THE GATING FUNCTION (the MoE core — how the expert is chosen) ──
The routing decision BLENDS four signals into a score per candidate model:
```typescript
function gate(analysis: ShotAnalysis, pool: ModelDef[], user: RoutingPolicy,
             live: PerfMatrix): { modelId: string, rationale: string } {
  const scored = pool.map(m => ({
    model: m,
    score: staticMatch(analysis, m)          // base capability match (the routing matrix)
         * 1.0
         + policyBonus(user, analysis, m)     // learned procedural policy (Part 3)
         + liveHealth(live, m)                // live perf matrix (speed/success now)
         - claudeSuggestionBias(analysis, m), // Claude's pool-aware suggestion weight
  }))
  // exclude circuit-broken models (3 consecutive failures = down):
  const healthy = scored.filter(s => !live[s.model.id]?.circuitOpen)
  return pickTop(healthy)
}
```
PRIORITY (matches showcase): Claude suggestion → learned policy → live scores →
static matrix (fallback). The gate is deterministic given its inputs; the LLM
only produces the ANALYSIS (2a) and the initial suggestion, not the final pick.

── 2c. STATIC ROUTING MATRIX (v1 pool of 7 — the fallback base) ──
```typescript
const ROUTING_MATRIX: { match: Partial<ShotAnalysis>, modelId: string }[] = [
  { match: { humanPresence:'dialogue' },            modelId:'seedance-2.0' },
  { match: { humanPresence:'close_up' },            modelId:'seedance-2.0' },
  { match: { physicsType:'fluid' },                 modelId:'veo-3.1' },
  { match: { physicsType:'fire' },                  modelId:'pixverse-c1' },
  { match: { sceneType:'vfx' },                     modelId:'pixverse-c1' },
  { match: { audioType:'native-audio-required' },   modelId:'grok-imagine' },
  { match: { sceneType:'action' },                  modelId:'kling-3.0' },
  { match: { qualityTier:'blockbuster' },           modelId:'veo-3.1' },   // APEX/hero
  { match: { qualityTier:'draft' },                 modelId:'ltx-fast' },
  // CONTROL (runway) chosen when camera-precision flag set (Phase 5 UI signal)
]
// staticMatch scores how well a model's role fits the analysis; the matrix is the
// tie-break/fallback. Expanding the pool later = adding rows, not changing the gate.
```

── 2d. LIVE PERFORMANCE MATRIX (route around what's slow/broken NOW) ──
```typescript
interface PerfMatrix { [modelId: string]: {
  avgLatencyMs: number; p95LatencyMs: number
  successRate: number           // rolling 20-sample
  consecutiveFailures: number
  circuitOpen: boolean          // true after 3 consecutive failures → excluded
}}
// Updated after EVERY generation (Stage 3 reports timing+outcome). A model that
// craters (e.g. Wan → 900s) drops out of routing within 3-4 samples automatically.
recordGeneration(modelId, { latencyMs, success }): void   // updates the matrix
```

MoE ROUTER CURSOR PROMPT:
```
Implement the MoE router per spec-3 Part 2. analyzeShot (one claudeCall →
ShotAnalysis). gate() blending static matrix + learned policy + live perf +
Claude suggestion, excluding circuit-open models. routeShot writes
Shot.selectedModelId ONLY when modelOverride=false (respect manual override
absolutely). recordGeneration updates PerfMatrix after every Stage-3 result;
open the circuit after 3 consecutive failures. The gate is deterministic; the
LLM only supplies analysis + suggestion. Build with the v1 pool of 7; the matrix
is data (rows), so pool expansion needs no gate change.
```

═══════════════════════════════════════════════════════════════════════
# PART 3 — THE 4 MEMORY STORES (CoALA) + RLAIF
═══════════════════════════════════════════════════════════════════════
These make cognition improve over time. All BYPASSABLE — the pipeline works with
empty memory (just no personalization). Desktop: SQLite+local vector; Web:
Postgres+pgvector.

── WORKING MEMORY (ephemeral — current session) ──
```typescript
interface WorkingMemory {   // Redis (web) / in-proc (desktop)
  projectId: string
  continuity: { characterId: string, wardrobe: string, position: string }[]
  timeOfDay: string; lighting: string
}
// Ensures MAYA's red jacket in scene 1 persists to scene 7. Read by Stage 0/1/3
// when composing prompts. Cleared at project end.
```

── EPISODIC MEMORY (permanent — every project) ──
```typescript
interface EpisodicRecord {   // Postgres+pgvector / SQLite+vector
  id: string; userId: string; projectId: string
  intent: string; embedding: number[]     // vector of the brief
  qualityScores: number[]; modelsUsed: string[]; outcome: 'exported'|'discarded'
}
retrieveSimilar(briefEmbedding: number[], userId: string, k: number): Promise<EpisodicRecord[]>
// On new project → vector-similarity search past projects → inform the brief
// ("what have I made like this, what worked").
```

── SEMANTIC MEMORY (permanent — distilled taste) ──
```typescript
interface SemanticInsight { userId: string; insight: string; confidence: number }
// Every ~10 projects, a consolidation pass extracts durable insights:
// "prefers slow pacing + warm grades", "noir → kling+seedance". Fed to Intent (C1).
consolidateSemantic(userId: string): Promise<SemanticInsight[]>   // batch job
```

── PROCEDURAL MEMORY (permanent — learned routing policy) ──
```typescript
interface RoutingPolicy { userId: string; contentType: string; modelId: string; winRate: number }
// After 5+ generations of a content type, statistical policy overrides the static
// matrix for THIS user. Read by the gate (2b policyBonus).
learnPolicy(userId: string): Promise<RoutingPolicy[]>
```

── RLAIF (reward learning — the feedback signal) ──
```typescript
type RewardSignal = { modelId: string, value: number }
// export film → +1.0 ; regenerate → -1.0 ; watch-complete → +0.5 ; discard → -0.5
recordReward(userId, modelId, action): void
// Reinforces model combinations that produce films the user KEEPS. Feeds
// procedural policy + episodic outcome. Bounded, non-billable (pure bookkeeping).
```

MEMORY CURSOR PROMPT:
```
Implement the 4 memory stores per spec-3 Part 3. Working (ephemeral continuity),
Episodic (vector store + retrieveSimilar), Semantic (consolidation batch →
insights), Procedural (learned routing policy). RLAIF recordReward on export/
regenerate/watch/discard. ALL bypassable — pipeline runs with empty memory. Desktop
uses SQLite+local vectors; web uses Postgres+pgvector behind the same interface
(add to HostAdapter). Wire: Semantic→Intent(C1), Procedural→gate(2b),
Episodic→brief, Working→prompt composition. Consolidation + policy learning are
scheduled batch jobs, never in the hot path.
```

═══════════════════════════════════════════════════════════════════════
# PART 4 — INTELLIGENCE FIREWALL (model names never in UI)
═══════════════════════════════════════════════════════════════════════
- The renderer NEVER sees model names, endpoints, keys, or costs.
- User sees tiers ("Draft/Studio/Blockbuster") + "Forge Intelligence".
- All routing/registry/keys live in main process (desktop) / server (web), never
  in the renderer bundle. selectedModelId is resolved server/main-side; the UI
  sends a tier + (optional) manual role choice, not a model name.
- MANUAL MODE nuance: even manual selection presents ROLES/tiers, not raw model
  names, unless a "pro/dev" mode is explicitly enabled. (Reconciles manual control
  with the firewall.)
CURSOR PROMPT:
```
Enforce the Intelligence Firewall per spec-3 Part 4. Model registry, routing
matrix, endpoints, keys, costs live ONLY in main-process/server code — never
imported into the renderer bundle. UI communicates in tiers/roles. Verify the
renderer bundle contains no model names or endpoints (build-time check).
```

## HOW THIS SLOTS IN (no downstream rewire)
- cognitiveDirector() runs → CreativeBrief → Stage 1 breakdown (Phase 2) unchanged.
- routeShot() writes selectedModelId → Stage 2 resolveSelection (Phase 2) reads it,
  unchanged. modelOverride=true always bypasses the router.
- memory + RLAIF are side-channels feeding intent + gate; pipeline works without them.
- Build order: interfaces as pass-throughs FIRST (cognition off = v1 behavior),
  then fill stage by stage. Each addition is independently shippable & testable.

## NEXT
Phase 3 (this doc) = Cognitive Director + MoE router + 4 memory stores + RLAIF +
firewall — the answer to "have we specced the MoE pipeline".
Say "next" for PHASE 4 — Character System → Director Mode (creation, identity
persistence via seed/ref, voice linkage, wardrobe continuity, and exactly how a
character flows into every stage of generation).
