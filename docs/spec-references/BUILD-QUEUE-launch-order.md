# BUILD QUEUE — ordered prompts to run in Cursor (launch: "The Machines")
## Every fix + wave + spec, in EXECUTION order, mapped to the LAUNCH-CRITICAL-PATH tiers.
## Each row: the prompt file, its status, what it depends on, one-line purpose. Run top→down.
## Specs are FOLDED into their waves (not run separately). Deploy web + worker together (§Q).

═══════════════════════════════════════════════════════════════════════
# STATUS LEGEND
═══════════════════════════════════════════════════════════════════════
✅ applied/confirmed · ▶ do now · ⬜ ready to run · 🔁 re-run after waves · (fold) merged into a wave

═══════════════════════════════════════════════════════════════════════
# TIER 0 — FOUNDATION: get a shot to submit, land, and play
═══════════════════════════════════════════════════════════════════════
| # | Prompt | Status | Depends | Purpose |
|---|---|---|---|---|
| 0.1 | FIX-director-stall-after-keyframes.md | ✅ | worker | stage-advance (2nd openrouter fires) — DONE |
| 0.2 | FIX-simple-clip-routes-to-reference-not-library.md | ✅ | — | Simple→library + director gallery delete/move — DONE |
| 0.3 | **FIX-director-nan-cost-blocks-submit-and-shot-index.md** | ▶ NOW | registry cost | NaN cost fails the credit gate → no FAL submit; fix cost + shot index. TONIGHT'S BLOCKER |
| 0.4 | BUILD-F1-timeline-project-and-reconcile-guard.md | ⬜ | 0.3 | clip lands on the strip + reconcile guard (strip reads "No media") |
| 0.5 | BUILD-WAVE-B-LIBRARY-media-bin-and-drag.md | ⬜ | 0.4 | library home + drag-to-timeline; nothing auto-places; carries voiceover+lipsync (priced) |
EXIT T0: a Director run submits video to FAL → takes land in the LIBRARY → drag to strip → play.

═══════════════════════════════════════════════════════════════════════
# TIER 1 — CONSISTENCY: the headline capability (no drift)
═══════════════════════════════════════════════════════════════════════
| # | Prompt | Status | Depends | Purpose |
|---|---|---|---|---|
| 1.1 | BUILD-WAVE-3-orchestrator-intelligence.md | ⬜ | pipeline works | the director brain (needed before Wave 7) |
| 1.2 | BUILD-WAVE-2-chained-continuity.md | ⬜ | 1.1 | shot-to-shot continuity within scenes |
| 1.3 | BUILD-WAVE-4-training-lane.md | ⬜ | pipeline works | asset model + **variations[] (primary→derived)** + T2I derive mode + LoRA + backup |
| 1.4 | BUILD-WAVE-7-production-workflow.md | ⬜ | 1.1–1.3, B-LIBRARY | ingest script → resolve per (entity,variant) → **DAG auto-gen** → compile into library |
|  | SPEC-entity-variations-primary-reference.md | (fold)→4,7 | — | primary-reference/variations — FOLDED into 1.3 + 1.4 |
|  | SPEC-production-workflow-preproduction.md | (fold)→7 | — | Wave 7 design — FOLDED |
EXIT T1: Evie is the same person at 22 and 10; Callum's unmasking matches his suit; scenes flow.

═══════════════════════════════════════════════════════════════════════
# TIER 2 — SIGNATURE MOMENTS (the film's "wow")
═══════════════════════════════════════════════════════════════════════
| # | Prompt | Status | Depends | Purpose |
|---|---|---|---|---|
| 2.1 | BUILD-WAVE-B5-voiceover-finetune-panel.md | ⬜ | B-LIBRARY, D4 | voice generated (prompted+priced) + speech toolbar (tone/emotion/pauses) + lip-sync |
| 2.2 | (in Wave B) Colour Grade | ⬜ | B | the grade ARC — grey → colour-return at the streetlights |
| 2.3 | UNMASKING + ACCENT rehearsal | ▶ isolate | 1.3, 2.1 | prove the two HARD things on ONE scene BEFORE the full run (train Callum LoRA; test accent) |
EXIT T2: the reveal lands, the accent reads Australian, colour-return hits, mouths match.

═══════════════════════════════════════════════════════════════════════
# TIER 3 — POLISH + CAMPAIGN + HYGIENE
═══════════════════════════════════════════════════════════════════════
| # | Prompt | Status | Depends | Purpose |
|---|---|---|---|---|
| 3.1 | BUILD-WAVE-B-post-production-suite.md | ⬜ | B-LIBRARY | grade/effects/audio/master/EXPORT (also testable on imports now) |
| 3.2 | BUILD-WAVE-1-close-now.md | ⬜ (anytime) | — | honesty debt / cheap wires / Simple msg |
| 3.3 | FIX-post-waves-close-drift.md | 🔁 | after waves | close the 6 P0 drift + harden checkers (pre-commit, endpoint guard) |
| 3.4 | BUILD-WAVE-5-desktop-parity.md | ⬜ post-launch | web clean | desktop = core (INV-8) |
| 3.5 | BUILD-WAVE-6-moat-control-layer.md | ⬜ post-launch | B | overlays/tracker/compositor (deep pro tools) |
EXIT T3: a finished ~7-min export + vertical cut-downs; gate CLEAR; drift can't recur.

═══════════════════════════════════════════════════════════════════════
# THE ONE-LINE ORDER (copy/work down)
═══════════════════════════════════════════════════════════════════════
NaN-cost fix → F1 placement → Library → Wave 3 → Wave 2 → Wave 4 → Wave 7 → Wave B5 →
(prove unmasking+accent on one scene) → Wave B suite (grade/master/export) → Wave 1 →
post-waves drift fix → [post-launch: Wave 5, Wave 6].

═══════════════════════════════════════════════════════════════════════
# NOTES
═══════════════════════════════════════════════════════════════════════
- Dependency vs priority: the master dependency graph is DEFERRED-EXECUTION-PROGRAM; this queue
  is ordered for the LAUNCH film (LAUNCH-CRITICAL-PATH). Where they differ, launch order wins
  for getting "The Machines" showable.
- Every wave: deploy web + worker TOGETHER (§Q); after each, tsc 0 + chokepoints 0 +
  swallowed 0 + endpoints 0.
- Don't chase Tier 3 polish before Tier 1 consistency — a clean export of a drifting film still
  fails the showcase.
- Auto-generate users: Wave 7 T4 runs the primary→variation DAG unattended (cost-summed +
  confirmed + guarded); hand-resolve and skip both still work (progressive).