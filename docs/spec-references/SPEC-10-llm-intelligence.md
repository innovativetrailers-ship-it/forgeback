# SPEC-10 — LLM / INTELLIGENCE (18 controls) — THE MOAT, final chunk
# Inherits SPEC-00. Audit: 14 WIRED / 0 UI-ONLY / 0 STUB / 4 ABSENT.
# The cognitive director + 4 memory stores + LLM tiering are REAL and RUNNING. The
# 4 absent are control/exposure gaps (bypass, Grok stage, per-stage picker, memory
# toggles), not missing intelligence. Entities: cognition brief, memory stores,
# LLM_TIERS config. BILLING: all LLM = claudeCall/llmCall (confirm Tier-0 sweep).

═══════════════════════════════════════════════════════════════════════
# GROUP A — DIRECTOR PIPELINE (wired)
═══════════════════════════════════════════════════════════════════════

### Director on/off   [WIRED]  (Director mode → useCognition → processOrchestrateJob.
  ts:135; other modes leave it off, AIDirectorPanel.tsx:106). TIER: —.

### Director bypass   [ABSENT → TIER 2]
- PURPOSE: a clean bypass/degrade control. Currently COGNITION_ENABLED=off only
  skips the SECOND pass; the first pass still runs in director mode; a failed stage
  falls back to raw prompt on its own (flag.ts:2).
- UI: (build) a per-stage + master cognition toggle (on/bypass) in the director panel.
  DATA: per-stage flags. BACKEND: skip the stage, degrade to the partial brief (the
  degrade path exists). Cross-ref spec-3 (bypassable stages).
- TIER: 2 (control over an existing capability).

### Intent stage   [WIRED]  (reads prompt + semantic memory → rewrites brief, director.
  ts:38; creative tier). TIER: —.
### Affect stage   [WIRED]  (emotional arc into brief, director.ts:58). TIER: —.
### Ideation stage   [WIRED]  (concept/style/scene list → enriched prompt, director.ts:69). TIER: —.
### Critique stage   [WIRED]  (runs when idea score <0.85, replaces plan, director.ts:79). TIER: —.
NOTE: all 4 cognitive stages RUN. This is the moat, and it's real. Enhancement:
expose the critique threshold (0.85) and per-stage models (Group C) as controls.

═══════════════════════════════════════════════════════════════════════
# GROUP B — MODEL ROUTING (wired)
═══════════════════════════════════════════════════════════════════════

### Auto model routing   [WIRED]  (Auto → routeShot, processShotGenerateJob.ts:94).
  Cross-ref SPEC-01 model override, SPEC-FIX reference-capability routing. TIER: —.
### Manual model override   [WIRED]  (chosen model saved, resolveModel uses it, routing
  skipped, AwaitingDirectionCard.tsx:275). STATUS: desktop forwards a stored override,
  no picker — add one (SPEC-01). The draft-mode swap (SPEC-01 Quality tier, Tier-1)
  is a separate path. TIER: — (dropdown works).

═══════════════════════════════════════════════════════════════════════
# GROUP C — LLM TIERING (wired config; Grok + picker absent)
═══════════════════════════════════════════════════════════════════════

### Haiku / mechanical   [WIRED]  (default claude-haiku-4-5; LLM_MECHANICAL override;
  used by shot analysis, breakdown, patient zero, continuity, models.ts:5). TIER: —.
### Sonnet / creative   [WIRED]  (anthropic/claude-sonnet-5, live on OpenRouter 2026-09-29;
  LLM_CREATIVE override; breakdown only). Blockbuster may use anthropic/claude-opus-5.5
  for that one breakdown call. TIER: —.
### Opus / hard   [WIRED]  (default claude-opus-4-8; LLM_HARD; script parse asks Opus,
  ScriptEditor.tsx:137). STATUS: desktop casting calls a FIXED Opus id, ignores the
  env — FIX: read LLM_HARD on desktop too (parity). TIER 2 (small parity fix).

### Grok per stage   [ABSENT → TIER 2]
- A helper would pick Grok for a "reasoning" task; NOTHING calls it (llm.ts:87). No
  stage set to Grok.
- FIX: wire llmCall provider-aware (Grok→xAI, Claude→Anthropic, one gated chokepoint)
  and add a 'technical' tier defaulting to grok-4.7 for camera/effects structured
  output (per addendum-llm-routing-grok). Grok on the CI chokepoint (rule 1 / Tier 0).
- NOTE per CORRECTION-motion-brush-reality: camera is now prompt-text, which WEAKENS
  the Grok-for-camera rationale (no structured params to emit). So this is an OPTIONAL
  pilot, not a priority — measure Grok vs Sonnet on the technical prompt-writing after
  billing is safe. Cross-ref addendum-llm-routing-grok.
- TIER: 2 (optional pilot; config-driven so it's a one-line add).

### Per-stage model picker   [ABSENT → TIER 3]
- Tiers are 3 env vars; no UI assigns Haiku/Sonnet/Opus/Grok to a stage. UI: (build)
  a settings panel mapping each stage → a tier. DATA: the LLM_TIERS map (config).
  BACKEND: llmCall reads it (already tier-driven). TIER 3 (power-user control; env
  vars suffice for now).

═══════════════════════════════════════════════════════════════════════
# GROUP D — MEMORY (all wired; no toggles)
═══════════════════════════════════════════════════════════════════════

### Episodic memory   [WIRED]  (director writes/recalls episodes, episodic.ts:18). TIER: —.
### Semantic memory   [WIRED]  (intent reads taste; consolidation, semantic.ts:13). TIER: —.
### Procedural memory   [WIRED]  (win rates → auto routing; updated after director
  render, procedural.ts:39). Cross-ref SPEC-FIX (procedural policy feeds the gate). TIER: —.
### Working memory   [WIRED]  (wardrobe/props in Redis 6h; skipped when COGNITION_ENABLED
  off, continuity.ts:13). Cross-ref SPEC-04 character wardrobe continuity. TIER: —.

### Memory toggles   [ABSENT → TIER 2]
- All four stores run whenever their caller runs; no on/off.
- FIX: (build) per-store toggles in settings (privacy/control — some users want no
  persistence). DATA: per-store enabled flags. BACKEND: guard each store's read/write.
  All memory is already bypassable in principle (empty memory = no personalization).
- TIER: 2 (user control over an existing, working system).

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
THE MOAT IS REAL: 4-stage cognitive director + 4 memory stores + LLM tiering all
RUN. The 4 absent are CONTROL/EXPOSURE gaps, not missing intelligence:
TIER 2: director bypass (per-stage toggle), Grok technical tier (optional pilot,
  config-driven), memory toggles, desktop Opus-env parity.
TIER 3: per-stage model picker UI (env vars suffice now).
The RLAIF learning loop (RewardSignal → procedural policy) — confirm the consumer
exists (the earlier audit flagged RewardSignal logged but no consumer). If absent,
wire procedural-policy learning from RewardSignal. Cross-ref spec-3 Part 3.
BILLING: every LLM stage routes through claudeCall — confirm in the Tier-0 sweep
that NO cognition stage bypasses it (the 20-Anthropic-site fix covers this).

## CROSS-REFS
- Auto routing + procedural policy → SPEC-FIX reference-capability routing + spec-3 MoE.
- LLM tiering + Grok → addendum-llm-routing-grok + CORRECTION-motion-brush-reality
  (camera-as-prompt weakens Grok-for-camera).
- Working memory → SPEC-04 character wardrobe continuity.
- All LLM gating → Tier-0 sweep (the ~20 ungated Anthropic sites).
- Draft-mode swap → SPEC-01 Quality tier (Tier-1).

## THIS COMPLETES THE 340-CONTROL SPEC (SPEC-01 through SPEC-10).
Say "next" for the WRAP-UP: the master build-consolidation view across all 10
chunks — how the 146 absent controls collapse into a handful of shared engines,
the complete tiered picture, and the recommended build sequence.
