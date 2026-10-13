# BUILD/REPAIR PROMPTS — INDEX & RULES (Cursor execution)
# Converts the full spec (SPEC-01..10) into unambiguous Cursor build prompts,
# chunked by TIER + system to avoid drift. Each prompt = one bounded, verifiable
# unit. Feed ONE chunk per Cursor session. This index defines the invariants EVERY
# prompt inherits — stated once, referenced by number in each prompt.

═══════════════════════════════════════════════════════════════════════
# THE CHUNKING (feed in this order; one per Cursor session)
═══════════════════════════════════════════════════════════════════════
TIER 0 — BILLING (before lifting pause; blocks everything):
  BP-01  Gate every ungated paid path + comprehensive CI guard
  BP-02  Idempotency + draft-swap kill + HappyHorse hard-fail
TIER 1 — BUGS & LIES (silent-drop + UI-only; degrade real output):
  BP-03  Silent-drop bugs (style-drop, quality-tier, native-audio, CGI jobId, razor)
  BP-04  UI-only lies + broken web wiring (JKL, green-screen, template, routes)
  BP-05  Honesty (RAW/ProRes/100+/200+/8-status false claims — scope to reality)
TIER 2 — CHEAP WINS (built-but-unmounted + plumbing-exists):
  BP-06  Mount the graveyard (LUT panel, ParametricEQ, scopes, tracker, subtitle-xl)
  BP-07  Expose frozen params (seed, voice emotion/stability, negative prompt, tiers)
  BP-08  Precision batch (Micro-Colour ranges to spec; desktop parity fixes)
TIER 3 — DEPTH & MOAT (build on demand; the shared engines):
  BP-09  OverlayEngine (charts/data — the differentiator, build first of Tier 3)
  BP-10  Shared color/lighting engines (mask, curve→LUT, zone, face subsystem)
  BP-11  The control-layer moat (node graph + comp camera + tracker + keyframes)
  BP-12  Audio depth (Spectrum EQ + Master Suite — deprioritize hardest)
  BP-13  Remaining depth (per-model absents, ForgeReview portal, etc.)

═══════════════════════════════════════════════════════════════════════
# INVARIANTS — every prompt states "obey INV-1..8 from BP-00"
═══════════════════════════════════════════════════════════════════════
INV-1 CHOKEPOINT: any paid-API call (FAL/Anthropic/ElevenLabs/Suno/Tripo/Runway)
  routes through the ONE gated submit for that provider (providerSubmit / claudeCall
  / llmCall). It MUST assert isGenerationPaused (except billableClass:'interactive'
  = real-time user UX only) AND carry ctx.source AND log the call. NO exceptions.
INV-2 SINGLE STORE: any timeline-clip write goes through the ONE unified store.
  Never a second clip store. Never addClip outside it.
INV-3 SCHEMA-DRIVEN: model payload params are derived from the model's live OpenAPI
  schema (buildPayload) — enums/required/forbidden/ranges from the schema, never
  hardcoded. Absent field for a model = hide the control for that model.
INV-4 HONEST UI: a control MUST NOT imply precision/capability the backend lacks.
  Coarse backend → coarse UI. No control that renders and does nothing. No claim
  (count/format) the code can't back.
INV-5 NO SILENT SUBSTITUTION: the model/style/setting the user selected is the one
  used. resolveModel throws on unknown; assertModelIntegrity blocks selected≠submitted.
  A downgrade (e.g. draft preview) must be EXPLICIT and VISIBLE, never silent.
INV-6 STRUCTURED INTENT: camera/style/character/overlay intent is stored as DATA
  objects and rendered (to prompt now); alternate renderers wire later without rewrite.
INV-7 ADDITIVE MIGRATIONS: schema changes are additive (prisma migrate dev/deploy);
  NEVER reset. Keep auth tables. New columns default-null/backfilled.
INV-8 DESKTOP/WEB PARITY: shared logic lives in @cinema/core; only the adapter
  differs. A fix on one host notes/handles the other. Heavy features = desktop-only.

═══════════════════════════════════════════════════════════════════════
# OUTPUT CONTRACT — every build prompt tells Cursor to return this
═══════════════════════════════════════════════════════════════════════
For each task in the prompt, Cursor must:
  1. State the file(s) it will change (exact paths from the spec's file:line).
  2. Make the change per the DETAILED SPEC in the prompt (no interpretation).
  3. Add/confirm the ACCEPTANCE test from the prompt.
  4. Run tsc (both apps if shared) + the relevant test; report pass/fail.
  5. For paid-API tasks: confirm INV-1 (gated) + run check:chokepoints.
  6. NOT touch anything outside the prompt's scope (no drive-by refactors).
  7. Report: files changed, tests run, INV compliance, anything blocked.
If a prompt's assumption doesn't match the code, Cursor STOPS and reports the
mismatch — it does NOT guess. (The spec's file:line may have moved; reconcile,
don't invent.)

═══════════════════════════════════════════════════════════════════════
# HOW PROMPTS REFERENCE SPECS (traceability, no drift)
═══════════════════════════════════════════════════════════════════════
Every task cites its SPEC source (e.g. "SPEC-08 Group A: style-drop bug") and its
file:line from the audit. The prompt RESTATES the full requirement inline (so
Cursor needs only the prompt), but the citation lets you verify against the spec.
Each prompt is SELF-CONTAINED: all context needed is in the prompt; no "see other
doc" for the actual work.

## GATING BETWEEN CHUNKS
- BP-01/02 (Tier 0) MUST be green before lifting pause or running any billable test.
- BP-03/04/05 (Tier 1) after Tier 0; these are the "stop degrading output" fixes.
- BP-06/07/08 (Tier 2) after Tier 1; cheap high-value.
- BP-09..13 (Tier 3) on demand; BP-09 (OverlayEngine) is the highest-value new build.

## NEXT
Say "next" for BP-01 (Tier 0 — gate every ungated paid path + comprehensive CI).
This is the unblocker; it's the most detailed prompt because it's the most critical.
