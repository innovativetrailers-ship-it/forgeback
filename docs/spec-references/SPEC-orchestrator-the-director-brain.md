# SPEC — THE ORCHESTRATOR (the informed director-brain that delegates the MoE)
# The single intelligence that: interprets a script into grounded full scenes, KNOWS
# every model family deeply, delegates each shot to the right model for its purpose,
# and LEARNS to orchestrate better over time. Ties together the cognitive director
# (spec-3), the MoE gate, the family docs (FAMILY-01..10), the tool matrix (MP-02b),
# and chaining (MP-13). Obey INV-1..8. This is the BRAIN — the moat that makes it a
# director, not a router.

═══════════════════════════════════════════════════════════════════════
# THE FOUR JOBS OF THE ORCHESTRATOR
═══════════════════════════════════════════════════════════════════════
1. INTERPRET — turn a script idea into a grounded, coherent multi-scene shot plan that
   stays TRUE to the premise (expand faithfully; never replace — FIX-I, deeper).
2. KNOW — hold deep, current knowledge of every model family: strengths, weaknesses,
   costs, tools, best-use. Not a table it looks up — knowledge it REASONS with.
3. DELEGATE — match each shot's PURPOSE to the model whose STRENGTH serves it (fill /
   hero / camera / consistency / continuity / dialogue / budget).
4. LEARN — improve delegation from outcomes (which model actually delivered for which
   shot type) — the MoE gets better, the orchestration is truly learned.

═══════════════════════════════════════════════════════════════════════
# JOB 1 — SCRIPT INTERPRETATION (grounded expansion, premise-true)
═══════════════════════════════════════════════════════════════════════
The orchestrator expands a script idea into a full shot plan WITHOUT drifting from the
premise. Deeper than FIX-I (which stops invention) — this is FAITHFUL EXPANSION:
```
STAGES (each a claudeCall, tiered — spec-3 cognitive director, made concrete):
1. PREMISE LOCK — extract the IMMUTABLE core: who (characters), what (the story/action),
   where (settings), the genre/tone. This is the SPINE. Store it; every later stage is
   constrained by it. (Prevents the alien→stone-hands failure at the structural level.)
2. STRUCTURE — break the premise into SCENES (beginning/middle/end, beats), then scenes
   into SHOTS. Each scene/shot derives FROM the premise (a scene must trace to a premise
   element). A shot that doesn't serve the premise is cut.
3. GROUNDING CHECK — each generated scene/shot is validated against the premise lock:
   does it feature the premise's characters/settings/action? A scene that drifted
   (new unrequested subject) is REGENERATED against the spine. (Automated fidelity gate.)
4. ENRICHMENT — WITHIN the locked premise, add cinematic treatment: pacing, mood,
   camera, lighting, shot variety. Enrichment changes HOW, never WHO/WHAT/WHERE.
5. SHOT SPEC — each shot gets: its faithful prompt, its PURPOSE (below), its
   character/location refs, its camera intent, its continuity link (chainFrom).
```
OUTPUT: a shot plan where every shot traces to the premise, tagged with its purpose,
refs, camera, and chain link — ready for delegation (Job 3).
LLM tiering: premise-lock = mechanical (Flash-Lite); breakdown = creative
(anthropic/claude-sonnet-5). Blockbuster breakdown may use anthropic/claude-opus-5.5.
Grounding stays mechanical. (Per addendum-llm-routing.)

═══════════════════════════════════════════════════════════════════════
# JOB 2 — MODEL KNOWLEDGE (the orchestrator must be deeply informed)
═══════════════════════════════════════════════════════════════════════
The orchestrator queries a MODEL-KNOWLEDGE RAG — it does NOT hold a hardcoded table
(that goes stale: this session alone saw Sora deprecated, Wan 3 arrive, Seedance 2.5,
Gemini Omni Flash). The knowledge is INDEXED + RETRIEVED, queried BY SHOT NEED, not by
model name. The RAG entry per model (indexed + embedded):
```typescript
interface ModelKnowledge {
  id: string
  strengths: string[]        // what it's BEST at
  weaknesses: string[]       // what to avoid it for
  bestFor: ShotPurpose[]     // the purposes it should serve
  tools: ToolCapability      // from MP-02b Part D (verified) — camera/ref/frames/audio/voice
  cost: { perSecond: {res→$}; tier: 'draft'|'standard'|'premium' }
  consistencyRank: number    // for identity/continuity shots
  motionRank: number; cameraRank: number; audioRank: number  // per-dimension quality
  maxDuration: number; nativeAudio: boolean; videoRefCapable: boolean  // hard facts
}
```
DISTILLED KNOWLEDGE (from FAMILY-01..10 + the arena rankings — seed values, LEARNED over time):
- SEEDANCE 2.0/2.5 — CONSISTENCY + multimodal composition. Best for: character shots,
  multi-subject, dialogue (native @Audio lipsync), style-referenced. The composition engine.
- WAN 3.0 — CONTINUITY (video-ref, 30s takes) + all-in-one. Best for: chained sequences,
  long consistent takes, reference-heavy shots.
- VEO 3.1 — HERO QUALITY + native 48kHz audio + 4K. Best for: key/establishing hero
  shots, shots needing top fidelity, extendable scenes.
- KLING 3.0 — MOTION + stylized + voice-ID. Best for: action, motion-heavy, multi-shot,
  voiced dialogue.
- HAPPYHORSE 1.0 — #1 QUALITY + multilingual lipsync. Best for: dialogue, top-quality hero.
- HAILUO / GROK — FAST + cheap + audio. Best for: quick shots, drafts, audio-native.
- PIXVERSE — CAMERA PRESETS (20+) + effects. Best for: specific camera moves, stylized.
- LTX — CHEAPEST + fast. Best for: DRAFT/previs, fill shots, low-stakes b-roll.
## THE MODEL-KNOWLEDGE RAG (queried by NEED, indexes 3 layers)
The RAG indexes, per model, THREE layers — so retrieval reflects claim AND reality:
1. DOC KNOWLEDGE — the distilled strengths/purpose/tools/cost from FAMILY-01..10 +
   the tool matrix (MP-02b Part D). What the model CLAIMS.
2. LIVE CAPABILITY — the current OpenAPI schema (modes, fields, limits). What it CAN
   actually take right now (auto-refreshed — survives new versions/deprecations).
3. LEARNED OUTCOMES — per-purpose performance from Job 4 (kept/regen/approved rates on
   THIS user's content). What it actually DELIVERED.
RETRIEVAL IS BY NEED, not by name:
```typescript
// The orchestrator asks the RAG about a SHOT'S NEED, gets ranked candidates + reasons:
const candidates = await modelRAG.query({
  purpose: shot.purpose,           // 'dialogue' | 'consistency' | 'hero' | 'fill' | ...
  needs: { mode, consistency: shot.consistencyNeed, camera: shot.cameraNeed,
           audio: shot.needsDialogue, continuity: !!shot.chainFrom },
  constraint: { tier: project.qualityTier, budgetCents: shot.budget, deadline },
})
// → returns [{ model, mode, fitScore, reason, costEstimate }] ranked for THIS need
//   under THIS constraint. NOT "what is Seedance" — "what serves THIS shot, given budget".
```
The RAG is UPDATED continuously: docs on model changes, OpenAPI on schema refresh,
learned outcomes after each shot (Job 4). So the orchestrator's knowledge is CURRENT +
personalised, never a stale hardcoded table. New model ships → indexed → available.
This is why the orchestrator stays INFORMED and SPECIALISED as the landscape churns.

═══════════════════════════════════════════════════════════════════════
# JOB 3 — DELEGATION (match shot PURPOSE to model STRENGTH)
═══════════════════════════════════════════════════════════════════════
Every shot gets a PURPOSE (Job 1 Stage 5). The orchestrator delegates by purpose:
```typescript
type ShotPurpose =
  | 'hero'          // key shot, quality matters most → Veo / HappyHorse (premium)
  | 'fill'          // b-roll, establishing, low-stakes → LTX / Hailuo (cheap, fast)
  | 'camera'        // specific camera move is the point → PixVerse presets / Runway* / Seedance
  | 'consistency'   // recurring character, identity critical → Seedance ref / Wan 3
  | 'continuity'    // continues the previous shot → Wan 3 chain (MP-13) / Seedance @Video
  | 'dialogue'      // lip-synced speech → HappyHorse / Seedance @Audio / Kling voice-ID / Veo
  | 'motion'        // action, fast movement → Kling / Seedance
  | 'draft'         // previs, cheap iteration → LTX / Hailuo-fast
function delegate(shot, pool, knowledge): { model, mode, reason } {
  // 1. hard filter: models that SUPPORT the shot's mode (shotMode) + purpose need
  //    (dialogue → needs audio; continuity → needs videoRefCapable; camera → cameraRank)
  const capable = pool.filter(m => supportsMode(m, shot) && servesPurpose(m, shot.purpose))
  // 2. score by: purpose-fit (knowledge.bestFor) + quality-rank for the dimension +
  //    cost (tier vs the project's quality setting) + consistency need + availability
  // 3. respect manual override (INV-5) + the quality tier (draft→cheap, blockbuster→premium)
  // 4. blend: static knowledge + learned performance (Job 4) + optional Claude reasoning
  return best  // with a REASON (logged: why this model for this shot)
}
```
KEY: delegation is by PURPOSE, informed by the RAG (Job 2), weighted by learned
PERFORMANCE (Job 4), and CONSTRAINED by quality-vs-budget.

## QUALITY vs BUDGET — the SAME need resolves to DIFFERENT models by constraint
The crux of intelligent delegation: a shot's NEED is weighed against the CONSTRAINT.
The same dialogue shot routes differently by context:
- Draft tier / tight budget → Hailuo-fast or LTX (cheap, good-enough dialogue).
- Standard tier → Seedance (consistency + @Audio dialogue, mid cost).
- Blockbuster tier / quality-first → HappyHorse or Veo (top quality, premium cost).
The orchestrator weighs: purpose-fit × quality-need × (budget/tier constraint). A
project's qualityTier (Draft/Studio/Blockbuster) sets the quality-vs-cost balance; a
per-shot budget or a "this is the money shot" flag can override it upward. So the SAME
RAG candidates get re-ranked by the constraint — quality when it matters, budget when it
doesn't. That's the specialised judgement: knowing WHEN to spend and when to save.
A "hero dialogue shot of a recurring character in a continuous sequence" at Blockbuster
tier → the orchestrator reasons over the RAG candidates: needs consistency + dialogue +
continuity + top quality, budget permits → Wan 3 chain or HappyHorse/Seedance — pick by
the blend + the tier's quality weighting. The SAME shot at Draft → LTX/Hailuo, accept
lower consistency for speed+cost. That's TRUE, context-aware orchestration.

═══════════════════════════════════════════════════════════════════════
# JOB 4 — LEARNING (the MoE gets better — truly learned orchestration)
═══════════════════════════════════════════════════════════════════════
The orchestrator LEARNS which model actually delivers for which purpose:
```
- After each shot: record (purpose, model, mode, outcome). Outcome signals (RLAIF):
  kept/exported (+1), regenerated (-1), user-approved at gate (+0.5), failed (-1),
  watched-through (+0.5), discarded (-0.5). (spec-3 RewardSignal — wire the CONSUMER.)
- Update the model's per-purpose performance score (procedural memory, spec-3 + pgvector).
- The delegation gate BLENDS: static knowledge (seed) + learned performance (grows).
  Over time, "Seedance for consistency" becomes "Seedance delivered consistency 87% for
  MY content" — the orchestration adapts to the actual results on the user's films.
- Circuit-break: a model failing repeatedly for a purpose is deprioritized for it.
```
This closes the loop: the orchestrator doesn't just KNOW the models (Job 2) — it LEARNS
which knowledge holds for the actual work. The MoE becomes truly orchestrated, not static.
⚠ The RewardSignal consumer was flagged as possibly-missing (SPEC-10) — wire it HERE:
this is what it's for.

═══════════════════════════════════════════════════════════════════════
# HOW THE FOUR JOBS COMPOSE (the orchestrator's run)
═══════════════════════════════════════════════════════════════════════
```
SCRIPT → [Job 1: INTERPRET] → grounded shot plan (each shot: prompt+purpose+refs+camera+chain)
       → [Job 3: DELEGATE]   → each shot assigned a model+mode (by purpose, informed by
                               Job 2 KNOWLEDGE + Job 4 LEARNED performance)
       → [generate]          → shots (chained where MP-13 applies)
       → [gates]             → auto/manual quality (MP-13 Task 5)
       → [Job 4: LEARN]      → record outcomes → update per-purpose model scores
       → assemble film
```
The orchestrator = the cognitive director (Job 1) + the informed MoE gate (Jobs 2-3) +
the learning loop (Job 4), unified. It's ONE brain with four jobs, not four systems.

═══════════════════════════════════════════════════════════════════════
# WHAT TO BUILD (spec → implementation)
═══════════════════════════════════════════════════════════════════════
1. PREMISE LOCK + grounded expansion (Job 1) — extends the cognitive director (spec-3)
   with the immutable-spine constraint + the grounding check. Fixes drift structurally.
2. MODEL KNOWLEDGE BASE (Job 2) — the ModelKnowledge entries, seeded from FAMILY-01..10
   + the tool matrix (MP-02b Part D) + arena rankings. Given to the gate + (for hard
   calls) to a claudeCall for reasoning.
3. PURPOSE-DRIVEN DELEGATION (Job 3) — ShotPurpose on each shot; the delegate() function
   scoring by purpose-fit + quality-rank + cost + learned performance; logs the reason.
4. LEARNING LOOP (Job 4) — the RewardSignal consumer (wire it); per-purpose performance
   in procedural memory; the gate blends static + learned; circuit-break.
5. THE UNIFIED RUN — compose the four jobs (above) as the orchestrator's pipeline.

## ACCEPTANCE
[ ] Job 1: a script expands into scenes/shots that ALL trace to the locked premise; a
    drifted scene is caught + regenerated (the alien-not-stone-hands guarantee, structural).
[ ] Job 2: a model knowledge base exists (strengths/purpose/tools/cost/ranks per family).
[ ] Job 3: each shot is delegated by PURPOSE to a model whose strength serves it, with a
    logged reason; manual override + quality tier respected.
[ ] Job 4: outcomes update per-purpose model scores; the gate blends static + learned;
    the RewardSignal consumer is wired.
[ ] a complex shot (consistency+dialogue+continuity) is delegated to the right model by
    reasoning over the blend — demonstrably, with the reason logged.

## NET
The orchestrator is the informed director-brain: it INTERPRETS a script into grounded
full scenes true to the premise, KNOWS each model family deeply, DELEGATES each shot by
purpose to the model whose strength serves it, and LEARNS which models deliver for which
purpose over time. It unifies the cognitive director + the MoE gate + the learning loop
into one brain. This is the moat — the intelligence that makes it a DIRECTOR that
orchestrates, not a router that picks. Every other piece (families, pipeline, chaining,
tools) is what the orchestrator COMMANDS; this spec is the commander.
