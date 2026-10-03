# SPEC — ENTITY VARIATIONS via a PRIMARY REFERENCE (drift prevention)
## Neo (2026-09-29), from the first real film "The Machines": a character/asset commonly has
## MULTIPLE VARIATIONS (Evie@22 vs Evie@10 flashback; Callum in-suit vs unmasked; the machine
## standing/fallen/opening; a location night/dawn/lights-on). Generating each variation
## INDEPENDENTLY drifts (faces don't carry). FIX: generate a PRIMARY (canonical) reference
## FIRST, then generate every variation USING the primary as a reference input, so identity
## carries. Analysed + wired into the existing entity/asset model, Wave 7 resolution, and the
## batch auto-gen. Non-negotiables preserved: never blocks a build; nothing auto-places.

═══════════════════════════════════════════════════════════════════════
# 1. THE PROBLEM (grounded in the script)
═══════════════════════════════════════════════════════════════════════
Same entity, many appearances that MUST look like the same subject:
- EVIE: present-day (22) AND flashback (10) — same person, different age.
- CALLUM: faceless exosuit (most of the film) AND the unmasked young man (the reveal) — same
  identity, two forms.
- THE MACHINE: standing patrol / fallen in mud / helmet splitting open — same asset, states.
- LOCATIONS: London street at night (grey) / dawn / streetlights-on (colour returns at the
  end) — same place, lighting/grade states.
- SHARED across two films (The Machines + The Optimisation): Nan, the unmasking, the
  streetlights — "trained once and reused, same IDs and prompts".
Today the pipeline extracts entities and "generates reference images" + keyframes, but if each
variation/keyframe is generated INDEPENDENTLY from a text prompt, the subject DRIFTS. This is
the identity-consistency gap.

═══════════════════════════════════════════════════════════════════════
# 2. THE MODEL — entity → PRIMARY → derived VARIATIONS
═══════════════════════════════════════════════════════════════════════
Each ENTITY (character / asset / location) gains a small tree:
- PRIMARY reference: the canonical look (Evie's definitive face/appearance at her main age;
  the machine's canonical form; the village's base look). Resolved FIRST — imported, generated
  (T2I), or the anchor for a trained LoRA.
- VARIATIONS (0..n): each a named variant with:
  * variantId, label ("Evie@10", "Callum-unmasked", "machine-fallen", "street-lights-on")
  * generatedFrom: the PRIMARY (or another variation) — the reference LINEAGE
  * modifierPrompt: the DELTA only ("~12 years younger, child", "helmet open, wounded, lip
    blood", "streetlights on, colour graded warm")
  * generatedImage: the variation's resolved reference, generated USING generatedFrom as a
    REFERENCE INPUT (image-to-image / IP-adapter / reference-conditioned T2I), NOT a fresh
    text-only gen — this is what carries the face/form.
  * appearsInShots: the shots that use THIS variation.
- OPTIONAL (hero characters): a trained LoRA on the primary. Then variations generate FROM the
  LoRA (strongest carry). The resolution chain already ranks LoRA > reference (O3), so a LoRA'd
  entity uses the LoRA for every variation + shot.

═══════════════════════════════════════════════════════════════════════
# 3. DATA CONTRACT (additive on Wave 4.0 Asset — INV-7)
═══════════════════════════════════════════════════════════════════════
Extend the Asset (additive; existing single-reference assets still valid — a bare entity is
just a primary with 0 variations):
  Asset {
    ...existing (sourcePrompt, generatedImage, sourceRefs, trainedLoRA, resolutionState,
                 appearsInShots),
    isPrimary: boolean,                 // the canonical node
    variations: [{
      variantId, label,
      generatedFrom: assetId|variantId, // lineage (defaults to the primary)
      modifierPrompt,                   // the delta
      generatedImage?, resolutionState, // 'unresolved'|'imported'|'generated'|'trained'
      appearsInShots: [shotId...]
    }]
  }
Breakdown entities (Wave 7 T0) reference (entityId, variantId?) per shot, so a shot names WHICH
variation it needs. New fields OPTIONAL → existing breakdowns/assets load unchanged.

═══════════════════════════════════════════════════════════════════════
# 4. GENERATION IS A DAG — primaries → variations → keyframes → shots
═══════════════════════════════════════════════════════════════════════
Refines the batch auto-gen (W7-T4) from a flat parallel batch into a TOPOLOGICAL order:
1. PRIMARIES first: resolve/generate each entity's primary (or train its LoRA). Nothing that
   depends on a primary runs until it exists.
2. VARIATIONS next: generate each variation USING generatedFrom (primary/LoRA) as a reference
   input + its modifierPrompt. A variation whose lineage isn't ready waits for it.
3. KEYFRAMES: a shot's storyboard keyframe is generated USING the resolved (entity, variant)
   reference — so the keyframe itself carries identity (then used as first-frame for video).
4. SHOTS (video): generate from the keyframe/variation reference (+ LoRA if present) +
   continuity feed-forward (Wave 2). 
THE IDENTITY CHAIN: primary → variation → keyframe(first-frame) → video, each stage CONDITIONED
on the prior. Independent text-only generation at any stage is the drift bug — forbidden when a
parent reference exists.
Cost/parallelism: primaries + independent variations can parallelise; dependent nodes wait for
their parent. Cost estimate sums the DAG (feeds the priced prompt, INV-1). Mains get
primaries/LoRAs; background can stay prompt-only (C-4 prioritisation).

═══════════════════════════════════════════════════════════════════════
# 5. RESOLUTION AT SHOT TIME (refines resolveEntity + the cache)
═══════════════════════════════════════════════════════════════════════
- A shot references (entityId, variantId?). resolveEntity(entity, variant) → the variation's
  reference (which descends from the primary/LoRA) via the chain: trained LoRA → variation
  generatedImage → primary generatedImage → primary/variation prompt → generate-fresh.
- RESOLVE-ONCE PER (entity, variant), cache it (extends C-6 from per-entity to per-variant), and
  apply to all that variant's appearsInShots — so Evie@10 is identical across every flashback
  shot, Evie@22 across every present-day shot, both descending from the one Evie primary/LoRA.
- Two consistency axes still compose (O6): ENTITY/variant identity (primary→variation) + SEQUENCE
  continuity (feed-forward within a scene).

═══════════════════════════════════════════════════════════════════════
# 6. NO-BLOCK PRESERVED (the non-negotiable)
═══════════════════════════════════════════════════════════════════════
- If an entity has NO primary yet, the chain still degrades to prompt → generate-fresh (a shot
  still renders — never blocks). The primary-first rule is: WHEN a primary/LoRA EXISTS, variations
  and shots MUST derive from it (no independent drift); it does NOT add a required pre-step.
- If a primary generation FAILS, its variations fall back to prompt-only for that run (surfaced,
  not silent) rather than blocking the film. Consistency degrades; the build proceeds.
- Nothing auto-places on the timeline (library model holds): all takes land in the library; the
  user drags. This spec is about REFERENCE lineage, not placement.

═══════════════════════════════════════════════════════════════════════
# 7. CROSS-FILM SHARED ENTITIES ("trained once and reused")
═══════════════════════════════════════════════════════════════════════
The script shares entities across The Machines + The Optimisation (same IDs/prompts, shared
scenes cut into both). The primary + LoRA + variation tree are keyed by STABLE entity IDs and
referenced by BOTH films' breakdowns — the LoRA/primary is the shared root, trained/generated
once, reused. The asset model must allow an entity (and its variations) to be referenced by
multiple projects/plans (a shared library scope), not copied per film. (Ties to the private-tier
continuity story: these references + LoRAs are the client's held assets.)

═══════════════════════════════════════════════════════════════════════
# 8. ROUTING INTO THE EXISTING CONCEPT
═══════════════════════════════════════════════════════════════════════
| Piece | Built by / reuses |
|---|---|
| Asset variation tree (primary + variations, lineage) | Wave 4.0 Asset model — ADD variations[] + isPrimary (§3, additive) |
| Derive-from-reference generation | Wave 4.7 T2I studio — add image-to-image / reference-conditioned mode (generatedFrom → reference input) |
| DAG ordering (primaries→variations→keyframes→shots) | Wave 7 T4 batch auto-gen — topological, not flat (§4) |
| Per-(entity,variant) resolution + cache | Wave 7 T2 resolveEntity + C-6 cache (§5) |
| Keyframe carries identity | the storyboard-keyframe stage conditions on the resolved variation reference |
| Cross-film shared entities | Asset scope spanning projects (§7) |
| LoRA as strongest carrier | Wave 4.3 loraMechanism; chain LoRA > reference (O3) |
NEW work: variations[] + lineage on the Asset; the image-to-image derive mode; DAG ordering in
auto-gen; per-variant resolution cache; shared-entity scope. Everything else exists after Waves 4/7.

═══════════════════════════════════════════════════════════════════════
# 9. CONFLICTS & RESOLUTIONS
═══════════════════════════════════════════════════════════════════════
EV-1 Ordering vs cost/parallelism: a DAG serialises dependent nodes. → Parallelise independent
    nodes; only dependents wait. Cost estimate sums the DAG (priced, INV-1).
EV-2 Primary failed → variations orphaned: → variations fall back to prompt-only for the run,
    surfaced (not silent); film still builds (§6). Retry the primary → re-derive.
EV-3 LoRA vs primary-image for variations: if a LoRA exists it supersedes the primary image as
    the carrier (chain O3); variations generate from the LoRA. No double-conditioning conflict —
    pick the strongest available, LOG the choice (INV-5).
EV-4 Which variation for a shot: the breakdown names (entityId, variantId). If a shot names an
    entity but no variant → the PRIMARY variant. INTERPRET (Wave 7 T1) should detect obvious
    variants from the script (an age in a flashback, "helmet open") and propose them; the user
    can add/rename variants on the pre-production board.
EV-5 Drift within a variation across shots: resolve-once-per-(entity,variant) cache (§5) — the
    same reference feeds every shot of that variant; don't re-resolve per shot.
EV-6 Doesn't block: the primary-first rule constrains HOW references derive when they exist; it
    never adds a required step (§6). A zero-reference film still renders (t2v).

═══════════════════════════════════════════════════════════════════════
# 10. EXPERT DELTA (what I'd change from the raw idea)
═══════════════════════════════════════════════════════════════════════
1. Made it a TREE (primary → variations) with explicit lineage, not just "a primary then others"
   — so Evie@10 can derive from Evie@22, and a state can derive from another state.
2. Made generation a DAG with topological order (primaries→variations→keyframes→shots), refining
   the batch auto-gen rather than a new pass.
3. Extended the resolve-once cache to per-(entity,variant) so each variant is internally
   consistent across its shots.
4. Preferred a LoRA as the carrier when present (strongest), image-reference otherwise.
5. Preserved the no-block guarantee explicitly (primary-first constrains derivation, doesn't gate).
6. Made entities cross-film shared (the script reuses them) — the tree is a shared-scope asset.
