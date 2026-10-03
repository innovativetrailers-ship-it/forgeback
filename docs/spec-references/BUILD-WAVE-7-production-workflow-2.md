# BUILD — WAVE 7: PRODUCTION WORKFLOW (capstone: ingest → pre-pro → direct)
## Spec: SPEC-production-workflow-preproduction. Composes Waves 2/3/4/B into the
## flagship workflow. Non-negotiable: references are PROGRESSIVE — a user is NEVER
## blocked from building. Every task names the GATE it upholds. No gaps: the
## conflicts are addressed up front.

═══════════════════════════════════════════════════════════════════════
# DEPENDENCY GATE
═══════════════════════════════════════════════════════════════════════
- REQUIRES: Wave 4 (Asset model 4.0, T2I 4.7, training 4.4), Wave 3 (orchestrator +
  the one-planner fix from FIX-post-waves), Wave 2 (continuity), Wave B (import).
  AND the post-waves drift fix (check-endpoints guard live). Build AFTER these.
- The whole wave must keep the gate GREEN: A1.3 (one planner), INV-1 (billing),
  INV-3/C2 (schema-driven), INV-5 (no silent swap), INV-6 (typed intent), and the
  timeline-data invariant (§Q). Each task below says which it touches.

═══════════════════════════════════════════════════════════════════════
# CONFLICTS & RESOLUTIONS (address NOW — this wave touches everything)
═══════════════════════════════════════════════════════════════════════
C-1 New planner risk (A1.3): ingestion/breakdown must NOT add a 5th orchestrator
    entry. → It is a MODE/input of the ONE `orchestrate` (index.ts), never a new
    entry. GATE A1.3 stays PASS.
C-2 Breakdown-schema break: extending breakdownToShots must not break Simple/
    Director. → The richer schema is ADDITIVE (new fields optional; existing shots
    still valid). Premise fidelity (enforceScriptFidelity) still enforced.
C-3 Hardcoded endpoints (INV-3/C2): auto-gen (T2I) + entity gen must go through the
    registry + buildPayload, NOT hardcode fal-ai/. → All gen via the registry; the
    check-endpoints guard (drift fix) catches any hardcode. GATE INV-3/C2 PASS.
C-4 Billing on batch auto-gen (INV-1): "generate all references" is many paid
    calls. → Credit-gated (checkAccess), cost-estimate + confirm, through the
    guarded submit (pause applies). No un-metered batch.
C-5 The no-block fallback must actually generate: an unresolved entity can't break
    a reference-mode shot. → The resolution chain's TERMINAL fallback is TEXT
    generation (descriptor in the prompt via text-to-video), NOT reference-to-video.
    The mode-aware pipeline (shotMode/resolveEndpoint) picks t2v vs reference-mode
    BY whether references resolved. A shot with 0 resolved entities uses t2v. NEVER
    blocks.
C-6 Entity consistency vs per-shot drift: the SAME character must use the SAME
    reference/LoRA in every shot it appears in. → Resolve each entity ONCE per film,
    CACHE the resolution, apply to all its shots (appearsInShots). Not per-shot
    independent resolution.
C-7 Entity reference (LoRA) vs continuity feed-forward (video-ref) collision: a shot
    may want BOTH a character LoRA (entity) AND the prior shot's video (sequence).
    → These are DIFFERENT mechanisms: LoRA applies at inference (4.3 loraMechanism),
    video-ref is the reference input. A family that supports BOTH uses both. If a
    routed family can't (verify live per FAL), the orchestrator DECIDES by priority:
    within a continuous run → prefer feed-forward; entity-critical shot → prefer the
    LoRA; and LOGS the choice (INV-5, no silent). This is a real per-family check —
    do it in 4.3's family map (lora + video-ref capability flags).
C-8 Timeline clobber (invariant §Q): compiling many shots must MERGE, never delete.
    → Each compiled shot is added/retagged; reconcile preserves them (G3/G4 guard).
C-9 Ingestion variance: a loose idea vs a structured plan. → INTERPRET detects
    richness and adapts (structured→extract, screenplay→breakdown, idea→expand),
    reasoning tier per the routing map. One ingestion, any richness.
C-10 Asset model sufficiency: Wave 7 needs entity kind + appearsInShots + a
    RESOLUTION STATE on the Asset. → Extend Wave 4.0's Asset (additive) with
    `resolutionState: 'unresolved'|'imported'|'generated'|'trained'` and
    `appearsInShots: string[]`. (T0 below.)
C-11 ENTITY VARIATIONS / DRIFT (SPEC-entity-variations, Neo 2026-09-29): one entity has
    many variations that must look like the same subject (Evie@22 & @10; Callum suit &
    unmasked; machine standing/fallen/opening). → Generate the PRIMARY first, DERIVE every
    variation from it (image-to-image / LoRA); generate as a DAG: primaries → variations →
    keyframes → shots, each conditioned on the prior. A shot references (entityId,
    variantId). Resolve ONCE per (entity,variant), cache (extends C-6). NEVER an independent
    text-only gen when a parent exists. Uses Wave 4.0 variations[] + 4.7 derive mode.
    NO-BLOCK preserved: no primary → chain degrades to generate-fresh (never gates).

═══════════════════════════════════════════════════════════════════════
# W7-T0 — DATA CONTRACTS (additive; do first — everything reads these)
═══════════════════════════════════════════════════════════════════════
1. EXTEND the breakdown schema (additive) — packages/core, off breakdownToShots:
   Breakdown { scenes:[{ id, location, timeOfDay, description,
     shots:[{ id, type, angle, movement, duration, description,
              entityRefs:[{ entityId, variantId? }...] }] }],   // variantId names the needed variation (C-11)
     entities:[{ id, kind:'character'|'location'|'asset', name, descriptor,
                 appearsInShots:[shotId...] }] }
   entityRefs carries an optional variantId (Evie@10 vs Evie@22); no variantId → the PRIMARY.
   New fields OPTIONAL so existing Simple/Director breakdowns still validate (C-2).
2. EXTEND the Asset model (Wave 4.0, additive migration INV-7):
   + resolutionState: 'unresolved'|'imported'|'generated'|'trained'
   + appearsInShots: string[]   (linked from the breakdown entities)
   + isPrimary + variations[] (Wave 4.0 — the primary→variation tree, C-11)
3. INTERPRET (T1) should DETECT obvious variations from the script (an age in a flashback,
   "helmet open", a lighting/grade state) and propose them as variants on the primary; the
   user can add/rename variants on the pre-production board (T3).
VERIFY T0: the extended schemas validate; an existing breakdown/Asset still loads
(nulls/defaults for new fields); a shot can name (entityId, variantId); an entity carries
isPrimary + variations[]. Migration is additive (no DROP).

═══════════════════════════════════════════════════════════════════════
# W7-T1 — INGESTION → BREAKDOWN (through the ONE planner — GATE A1.3)
═══════════════════════════════════════════════════════════════════════
- Import a production plan / screenplay / idea → `orchestrate` (index.ts, the ONE
  entry) in an INGEST mode → INTERPRET parses to the T0 Breakdown, detecting
  richness (C-9). It de-duplicates entities into the production "bible"
  (entities[], each with appearsInShots).
- Reuses breakdownToShots (extended), enforceScriptFidelity. NO new planner (C-1).
VERIFY T1: import a plan → a Breakdown with scenes, shots (type/angle/movement),
and a de-duplicated entity list linked to shots. A loose idea also yields one.
grep: still ONE orchestrate entry (A1.3 holds).

═══════════════════════════════════════════════════════════════════════
# W7-T2 — ENTITY RESOLUTION ENGINE (the core; the no-block guarantee)
═══════════════════════════════════════════════════════════════════════
ONE resolution function in the orchestrator (packages/core), used by the board (T3)
and the director (T5):
- resolveEntity(entity, variantId?) → the best available input, via the CHAIN (C-5):
  trained LoRA (Asset.trainedLoRA) → the VARIATION's generatedImage → the PRIMARY's
  generatedImage/sourceRefs → prompt descriptor (Asset.sourcePrompt/descriptor, TEXT)
  → generate-fresh (text from the descriptor at gen time).
- PER-VARIANT (C-11): a variantId resolves to THAT variation's reference (which was
  DERIVED from the primary — Wave 4.7). No variantId → the primary. A variation with no
  own image yet falls to the primary, then the chain (never blocks).
- Resolve each (entity, variant) ONCE per film, CACHE it (C-6 extended per-variant), apply
  to all that variant's appearsInShots — so Evie@10 is identical across every flashback
  shot and Evie@22 across every present-day shot, both descending from the one Evie root.
- The resolution STATE (T0) tracks where each entity/variant is. Unresolved = falls to the
  text descriptor (never blocks).
VERIFY T2: resolveEntity(entity,variant) returns a usable input at every level; an
unresolved entity/variant returns its text descriptor (not null, not an error); the same
(entity,variant) yields the same resolution across its shots; a variant's image descends
from the primary (identity carries).

═══════════════════════════════════════════════════════════════════════
# W7-T3 — PRE-PRODUCTION BOARD UI (OPTIONAL, progressive — GATE: no-block)
═══════════════════════════════════════════════════════════════════════
- The T1 entities render as a board (Characters / Locations / Assets), descriptor
  pre-filled. Per entity, the user MAY: IMPORT (→ sourceRefs, via Wave B.1),
  GENERATE (→ T2I 4.7 → generatedImage), leave PROMPT-ONLY (sourcePrompt), or TRAIN
  (→ 4.4 LoRA). Each updates Asset.resolutionState.
- "AUTO-GENERATE ALL" = ONE optional action (T4).
- SKIPPABLE ENTIRELY: a prominent "Skip to Director" path. The board NEVER gates
  Direct. No entity is ever required.
VERIFY T3: an entity can be resolved four ways or left unresolved; the whole board
can be skipped; "Skip to Director" works with zero entities resolved.

═══════════════════════════════════════════════════════════════════════
# W7-T4 — COST-AWARE BATCH AUTO-GEN as a DAG (GATE INV-1, INV-3/C2) — the AUTO path
═══════════════════════════════════════════════════════════════════════
This IS the automated pipeline for users who want the system to do it all (Neo
2026-09-29). "AUTO-GENERATE ALL" / "I own or license these references + Confirm auto-
generate" runs the whole reference build UNATTENDED, in the correct DAG order — the user
does not hand-resolve entities.
- DAG ORDER (C-11, SPEC-entity-variations) — NOT a flat batch:
  1. PRIMARIES first: generate each SELECTED entity's primary (default mains; background
     stays prompt-only — C-4). Optionally train a LoRA for hero entities (4.4).
  2. VARIATIONS next: for each variation (detected by INTERPRET T1, or user-added T3),
     DERIVE it from its generatedFrom (primary/LoRA) via the 4.7 image-to-image mode +
     modifierPrompt. A variation waits for its parent (topological); independent nodes
     parallelise.
  3. (At director time T5) keyframes → shots consume the resolved (entity,variant) refs.
- Each gen: registry + buildPayload (C-3), credit-gated (checkAccess), guarded submit
  (pause applies). Lands as Assets (primary: isPrimary; variation: in variations[],
  resolutionState:'generated'). Nothing auto-places on the timeline (library model).
- COST ESTIMATE sums the WHOLE DAG (primaries + variations) and is shown + confirmed
  BEFORE running (the priced prompt, INV-1). A NaN/undefined cost is a typed error, never
  NaN (see FIX-director-nan-cost).
- PROGRESSIVE tie-in: auto-generate is ONE optional path. A user can still resolve some
  entities by hand (T3) or skip entirely (T6 Level 0) — the DAG runs over whatever is
  selected, and unresolved entities fall through the chain at director time (never blocks).
VERIFY T4: "auto-generate all" builds primaries THEN derives variations from them (a
variation's face carries the primary — not an independent gen); shows a whole-DAG cost
estimate + confirm; runs credit-gated through the guarded submit; check-endpoints green;
primaries + variations land as Assets; a partial/skip still works (progressive).

═══════════════════════════════════════════════════════════════════════
# W7-T5 — DIRECTOR COMPILE (resolution + mode + continuity + timeline)
═══════════════════════════════════════════════════════════════════════
The orchestrator reads the Breakdown (T1) + entity resolutions (T2, any level) +
the plan. For each shot IN ORDER:
1. RESOLVE the shot's entities via the cached resolution PER (entity, variantId) (T2,
   C-11) — the shot's entityRefs name which variation (Evie@10 vs @22). Unresolved →
   text descriptor (C-5). The variation's ref descends from the primary (identity carries).
2. PICK THE MODE (mode-aware pipeline shotMode/resolveEndpoint): resolved image
   refs → reference-to-video / elements[] / first-frame; none → text-to-video with
   descriptors. The resolution state DRIVES the mode. Keyframe (if used) is generated
   from the resolved variation ref (identity chain: primary→variation→keyframe→video).
3. APPLY ENTITY CONSISTENCY: trained LoRA via 4.3 loraMechanism (its correct
   per-family endpoint). Verify the routed family supports LoRA + (if chaining)
   video-ref together; if not, resolve by priority + LOG (C-7, INV-5).
4. APPLY SEQUENCE CONSISTENCY: chained continuity (Wave 2) — feed-forward within a
   scene, break at a cut (shot type/scene boundary from T1 drives it).
5. SELECT MODEL via delegate + the routing map. SUBMIT via the guarded spine.
6. LAND takes in the LIBRARY (scene folders), NOT the timeline — NOTHING auto-places
   (library model, BUILD-WAVE-B-LIBRARY BL-C1/BL-T5). The user drags chosen takes.
VERIFY T5: a film compiles shot-by-shot into the LIBRARY (no auto-placement); a character
with a resolved reference/LoRA is consistent across its shots AND its variations (Evie@10
matches Evie@22); a continuous scene chains, a cut breaks; an unresolved-entity film STILL
compiles (t2v). Every submit is guarded.

═══════════════════════════════════════════════════════════════════════
# W7-T6 — GATES & NO-BLOCK VERIFICATION (the whole-wave check)
═══════════════════════════════════════════════════════════════════════
Run the full path at THREE reference levels and confirm the gates:
- LEVEL 0 (zero references): import plan → Skip to Director → a film generates
  (t2v, prompt-only). NO BLOCK.
- LEVEL 1 (some references): resolve a few entities → mixed reference + t2v shots.
- LEVEL 2 (all trained): resolve + train all → full entity + sequence consistency.
- VARIATION CHECK (C-11): an entity with 2+ variations (e.g. Evie@22 + Evie@10) →
  auto-generate builds the primary then derives the variations; both read as the same
  subject across their shots (identity carries; no drift). A shot names its variant.
GATES held throughout: A1.3 (one planner), INV-1 (billing/guarded/credit),
INV-3/C2 (registry + check-endpoints green), INV-5 (no silent swap; C-7 logged),
INV-6 (typed breakdown/entities), timeline invariant (merge only).
tsc 0; check-chokepoints 0; check-swallowed-catches 0; check-endpoints 0.

═══════════════════════════════════════════════════════════════════════
# DO NOT
═══════════════════════════════════════════════════════════════════════
- Do not add a new orchestrator entry (mode of orchestrate only — C-1).
- Do not make the pre-production board a required step (no-block).
- Do not hardcode any fal-ai/ endpoint (registry + buildPayload — C-3).
- Do not resolve an entity/variant differently per shot (cache once per entity,variant — C-6/C-11).
- Do not generate a variation as an independent text-only gen when a parent exists —
  derive from the primary/LoRA (C-11, drift bug).
- Do not run auto-gen as a flat batch — order the DAG (primaries → variations — C-11).
- Do not let a batch auto-gen run un-metered or un-estimated; cost sums the whole DAG (C-4).
- Do not auto-place compiled takes on the timeline — land in the library (library model).

═══════════════════════════════════════════════════════════════════════
# WAVE 7 EXIT (the flagship workflow, proven)
═══════════════════════════════════════════════════════════════════════
Import a plan → (optionally) resolve entities by import/generate/prompt/train →
Director compiles the film shot-by-shot with entity + sequence consistency — AND a
zero-reference run still produces a film. Satisfies register G context-ingestion.
All gates green. This is the one-stop workflow; remove the backlog row + mark the
capstone done.
