# SPEC — PRODUCTION WORKFLOW: plan ingestion → pre-production → direct
## Neo's idea, analysed + optimised as an expert, then routed into the existing
## concept. This is the FLAGSHIP WORKFLOW that unifies the waves — it's mostly
## COMPOSITION of built pieces (asset model, T2I, training, orchestrator,
## continuity), not a new pipeline. Core principle: references are PROGRESSIVE
## ENHANCEMENT, never a gate — a user is NEVER blocked from building.

═══════════════════════════════════════════════════════════════════════
# 1. THE IDEA (Neo, 2026-09-28)
═══════════════════════════════════════════════════════════════════════
Import parses a PRODUCTION PLAN (shot types, angles, scenes, locations), not just a
script. User can auto-generate characters/scenes/assets from the plan, OR the parsed
reference prompts populate the character/asset/location menus. Per entity the user
can import their own reference OR generate from a prompt; auto-gen populates the
library; training can be applied. Then Director mode: the orchestrator reads the
parsed script + the character/location/asset renders + the production plan and
compiles shots one by one, linking frames/video for consistency. NON-NEGOTIABLE:
users are NOT blocked from building by not generating characters.

═══════════════════════════════════════════════════════════════════════
# 2. EXPERT ANALYSIS — what's strong, what to optimise
═══════════════════════════════════════════════════════════════════════
STRONG:
- It mirrors REAL film production (breakdown → build assets → shoot) — professional
  workflow parity, a moat vs prompt→video competitors.
- It REUSES everything: asset model (Wave 4.0), T2I studio (4.7), import (Wave B),
  training (4.4), orchestrator (Wave 3), chained continuity (Wave 2). Little new.
OPTIMISE (my expert changes):
- O1. PROGRESSIVE, NOT A GATE (your own requirement, architected): references are
  an ENRICHMENT layer. The director must work at ANY level — zero references
  (prompt-only), some, or all — degrading gracefully. Never a required step.
- O2. THREE SOURCE MODES, ONE ASSET MODEL: each entity resolves via IMPORT (user's
  image/video → sourceRefs) OR GENERATE (T2I → generatedImage) OR PROMPT-ONLY
  (sourcePrompt, no render). All write the SAME Asset (4.0). Training (LoRA) is an
  optional 4th enrichment on any of them.
- O3. RESOLUTION CHAIN (the no-block guarantee, below): at director time each
  shot's entities resolve LoRA > reference > prompt > generate-fresh. Missing =
  fall back, never stop.
- O4. COST-AWARE AUTO-GEN: "generate all references" is ONE optional action with a
  cost estimate + confirm; the orchestrator can prioritise (main characters get
  references/training; background assets stay prompt-only). Never blind bulk-gen.
- O5. FLEXIBLE INGESTION: accept a full structured production plan, a screenplay,
  OR a loose idea — the orchestrator's INTERPRET handles all (structured → extract;
  screenplay → breakdown; idea → expand). One ingestion, any richness.
- O6. TWO CONSISTENCY AXES (complementary, not either/or): ENTITY consistency
  (a character looks the same everywhere) = reference/LoRA; SEQUENCE consistency
  (shot-to-shot) = chained-continuity feed-forward (Wave 2). The director uses BOTH.

═══════════════════════════════════════════════════════════════════════
# 3. THE OPTIMISED DESIGN — three stages, progressive
═══════════════════════════════════════════════════════════════════════

## STAGE 0 — INGESTION → STRUCTURED BREAKDOWN (orchestrator INTERPRET)
Import a plan / screenplay / idea → the orchestrator parses to a PRODUCTION
BREAKDOWN:
```
Breakdown {
  scenes: [{ id, location, timeOfDay, description,
    shots: [{ id, type, angle, movement, duration, description,
              entities: [entityRef...] }] }],
  entities: [{ id, kind: character|location|asset, name, descriptor,
               appearsInShots: [shotId...] }]   // the production "bible"
}
```
- Extends breakdownToShots to the richer schema (shot type/angle/movement +
  per-shot entity references). Enforces premise fidelity (existing).
- The entities list is the PRODUCTION BIBLE — the set of things referenced across
  the film, each to be resolved in Stage 1 (optionally).
VERIFY 0: import a plan → a structured breakdown with scenes, shots (type/angle),
and a de-duplicated entity list; a loose idea also produces one (expanded).

## STAGE 1 — PRE-PRODUCTION BOARD (entity resolution — OPTIONAL, progressive)
The entities from Stage 0 appear as a board (grouped: Characters / Locations /
Assets), each with a descriptor pre-filled from the plan. Per entity, the user MAY:
- IMPORT a reference image/video (→ Asset.sourceRefs), OR
- GENERATE from the descriptor (T2I studio 4.7 → Asset.generatedImage), OR
- leave PROMPT-ONLY (Asset.sourcePrompt — the descriptor; no render), OR
- TRAIN a LoRA (4.4) on an imported/generated reference for stronger consistency.
- "AUTO-GENERATE ALL" is ONE optional action: batch-generate references for the
  entities the user selects (cost estimate + confirm; prioritise mains). Populates
  the library.
KEY: this stage is SKIPPABLE ENTIRELY. Nothing here blocks Stage 2. It's the
"reference prompts moved into the character/asset/location menus" idea, made
optional and unified under the Asset model.
VERIFY 1: an entity can be resolved by import, generate, prompt-only, or trained;
skipping the whole board is allowed; auto-gen shows a cost estimate before running.

## STAGE 2 — DIRECT (orchestrator compiles shots with resolution + continuity)
The orchestrator reads: the breakdown (Stage 0) + whatever entity resolutions exist
(Stage 1, any level) + the production plan. For each shot, in order:
1. RESOLVE each entity via the RESOLUTION CHAIN (O3):
   trained LoRA → generated/imported reference (image → reference-to-video /
   elements[] / first-frame) → prompt descriptor (text only) → generate-fresh from
   the shot+entity description. NEVER blocks on a missing reference.
2. GENERATE the shot with the resolved inputs, using the routing map (delegate).
3. CONTINUITY (Wave 2): chain within a scene (feed-forward on the prior shot's
   video), break at cuts — the shot type/scene boundary from Stage 0 drives this.
4. Entity consistency comes from the resolved references/LoRAs; sequence
   consistency from feed-forward. Both applied.
VERIFY 2: a film generates end-to-end with (a) zero references (prompt-only), (b)
some references, (c) all trained — each works; higher resolution = better
consistency, but none is required to build.

═══════════════════════════════════════════════════════════════════════
# 4. THE NO-BLOCK GUARANTEE (Neo's non-negotiable — architected)
═══════════════════════════════════════════════════════════════════════
- The pre-production board (Stage 1) is OPTIONAL. The Director never requires an
  entity to be resolved.
- The RESOLUTION CHAIN degrades: LoRA → reference → prompt → generate-fresh. The
  terminal fallback (generate-fresh from the descriptor) means EVERY shot can
  generate even with nothing pre-built. A user who imports a plan and hits Direct
  immediately gets a film (prompt-only), same as Simple/Director today.
- References/training only IMPROVE consistency; their absence never stops a build.
- The UI must never present a "generate references first" as a required step —
  it's an offered enhancement with a clear "skip / direct now" path.

═══════════════════════════════════════════════════════════════════════
# 5. ROUTING INTO THE EXISTING CONCEPT (mostly composition)
═══════════════════════════════════════════════════════════════════════
| Piece of this feature | Built by / reuses |
|---|---|
| Plan/screenplay/idea ingestion → breakdown | orchestrator INTERPRET + breakdownToShots (Wave 3), extended schema (shot type/angle/entities) |
| The entity "production bible" | new: a de-duplicated entity list off the breakdown |
| Pre-production board UI | new UI, built on: Asset model (Wave 4.0) + T2I studio (4.7) + import path (Wave B.1) + training (4.4) |
| Import / generate / prompt / train per entity | Asset model (4.0) three source modes + training (4.4) |
| Auto-generate all references | T2I studio (4.7), batched + cost-aware |
| Director reads plan + refs + bible | orchestrator (Wave 3) + resolution chain (new) |
| Shot-by-shot with consistency | chained continuity (Wave 2) + entity references |
NEW work (small, mostly glue): the richer breakdown schema, the entity list, the
pre-production board UI, the resolution chain, cost-aware batch auto-gen. Everything
else EXISTS after Waves 2/3/4.

═══════════════════════════════════════════════════════════════════════
# 6. EXECUTION PLACEMENT
═══════════════════════════════════════════════════════════════════════
This is a NEW WAVE (call it WAVE 7 — PRODUCTION WORKFLOW) that DEPENDS ON:
- Wave 4 (asset model 4.0, T2I 4.7, training 4.4) — the entity/reference substrate.
- Wave 3 (orchestrator) — the breakdown + resolution.
- Wave 2 (continuity) — sequence consistency.
- Wave B (import path) — the ingestion entry.
So it's the CAPSTONE that composes them into the flagship workflow — build it AFTER
its dependencies, not before. Until then, the register holds it.
It also satisfies register Section G "context ingestion (A2)" (the plan ingestion)
and is the product's headline differentiator.

═══════════════════════════════════════════════════════════════════════
# 7. WHAT I'D CHANGE FROM THE RAW IDEA (the expert delta, explicit)
═══════════════════════════════════════════════════════════════════════
1. Made references PROGRESSIVE, with a resolution chain + generate-fresh fallback,
   so nothing blocks (your requirement, architected — §4).
2. Unified import/generate/prompt/train under ONE Asset model (not separate paths).
3. Made auto-gen COST-AWARE + prioritised (mains first), not blind bulk generation.
4. Made ingestion FLEXIBLE (plan / screenplay / idea), not plan-only.
5. Separated the two consistency axes (entity vs sequence) so they compose.
6. Placed it as the CAPSTONE wave that composes existing waves — not a from-scratch
   pipeline, so it's cheap and coherent.
