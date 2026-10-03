# MODEL-PIPELINE BUILD PROMPTS — INDEX & RULES (Cursor)
# Implements FAMILY-INDEX-and-pipeline-spec + FAMILY-01..10, one family at a time.
# Fixes shots failing (wrong endpoint / wrong payload / wrong prompt). Feed ONE per session.
# Obey INV-1..8 from BP-00 (chokepoint, single store, schema-driven, honest UI, no silent
# substitution, structured intent, additive migrations, desktop/web parity).

═══════════════════════════════════════════════════════════════════════
# THE CHUNKS (feed in this order)
═══════════════════════════════════════════════════════════════════════
MP-01  Core scaffolding — the mode-aware architecture (registry shape, shotMode,
       resolveEndpoint, buildPayload skeleton, composePrompt skeleton, FamilyFieldMap).
       NO family data yet — just the machinery every family plugs into.
MP-02  SEEDANCE family (active pool — the one that failed). Verify + wire + test.
MP-02b SEEDANCE COMPOSITION + TOOL MATRIX — Seedance reference-to-video as a multimodal
       composition engine (typed slots, prompt-as-script, native voice) + the verified
       cross-family TOOL EXPOSURE matrix (which models expose which controls). Do with MP-02.
MP-03  KLING family (active pool). Verify + wire + test.
MP-04  VEO family.
MP-05  WAN family (most fragmented — verify hardest).
MP-06  MINIMAX/HAILUO family.
MP-07  GROK family.
MP-08  PIXVERSE family.
MP-09  HAPPYHORSE family (fix the text-endpoint image_url bug; add to pool after 1 clean gen).
MP-10  LTX family (draft tier).
MP-11  IMAGE models (separate builder — Nano Banana/Flux for keyframe + reference gen).
MP-12  TOOL CONNECTION + capability gating (every exposed control → a real field or hidden).
MP-13  CHAINED CONTINUITY (video-reference feed-forward). Do last, after shots generate
       on the mode-aware pipeline. Needs Wan 3.0 video reference. Gemini Omni stays
       evaluate-only.

═══════════════════════════════════════════════════════════════════════
# ROUTING REFINEMENT (reference-to-video preferred for identity-in-new-scene)
═══════════════════════════════════════════════════════════════════════
shotMode's 'reference' branch is PREFERRED for recurring-subject-in-a-NEW-composition
(the narrative-film default) — reference-to-video keeps identity while generating fresh
framing/motion, which first-frame can't. CARVE-OUTS (these override reference):
- ANCHOR CHAIN (continue the exact previous frame) → first_frame wins (continuity > identity).
- FAITHFUL KEYFRAME (animate this exact image) → first_frame.
- NO SUBJECT to condition on (establishing/abstract) → text (full model freedom).
Seedance reference-to-video is the PREFERRED reference route for multi-subject/dialogue/
style shots (MP-02b Part A). See MP-02b for the full routing + selection logic.

═══════════════════════════════════════════════════════════════════════
# NEW MODELS TO EVALUATE (surfaced in research — verify + consider for pool)
═══════════════════════════════════════════════════════════════════════
- Gemini Omni Flash 1.1 — full multimodal (img/vid refs), native audio, voice-ID, camera;
  retains face+clothing+voice. Strong Seedance/Veo alternative. (Add as MP-13 if adopted.)
- Seedance 2.5 — up to 50 multimodal inputs, 30s takes (upgrade from 2.0 in MP-02).
- H3 Max (fal-tuned MiniMax H3) — stronger prompt adherence (MP-06 variant).
- Kling 2.6 Pro — voice-ID + end-frame + lowercase-for-speech convention (MP-03 note).
Verify each via OpenAPI before adding.

═══════════════════════════════════════════════════════════════════════
# THE GOLDEN RULE FOR EVERY FAMILY PROMPT
═══════════════════════════════════════════════════════════════════════
VERIFY BEFORE WIRE. For every endpoint id, run the FREE OpenAPI fetch FIRST:
  GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>
  - 200 → the endpoint EXISTS; the returned schema is GROUND TRUTH for required/
    optional/enum fields. DERIVE the FamilyFieldMap from THIS, not from the family doc
    alone (the doc is the map; the schema is the truth).
  - 404 → the string is wrong; find the correct id (fal.ai/docs/llms.txt) before wiring.
NEVER wire an endpoint string without a 200 from the OpenAPI fetch. This is free (no
generation, no bill) and it's what stops the namespace-bug class.

═══════════════════════════════════════════════════════════════════════
# PER-FAMILY PROMPT STRUCTURE (every MP-02..10 follows this)
═══════════════════════════════════════════════════════════════════════
Each family prompt has the SAME 6 tasks:
1. VERIFY — OpenAPI-fetch every endpoint id for the family; report 200/404 + the schema.
2. REGISTRY — add the ModelDef: endpoints per mode + FamilyFieldMap (field names/enums
   from the schema) + limits (maxPromptChars, durationMode) + refTag + audioField.
3. PAYLOAD — the family's branch in buildPayload: map shot data → this family's field
   names, include ONLY the endpoint's schema fields, snap enums, assert required.
4. PROMPT — the family's rules in composePrompt: length cap, reference tag syntax
   (@/#/field), style structuring, camera-as-prompt.
5. TEST — for each mode the family has: build the payload, VALIDATE against the OpenAPI
   schema (no bill). Then ONE real generation per mode; confirm success.
6. GATE — do not proceed to the next family until every mode of this one passes.

═══════════════════════════════════════════════════════════════════════
# OUTPUT CONTRACT (every prompt)
═══════════════════════════════════════════════════════════════════════
Cursor must: state files changed; report the OpenAPI 200/404 per endpoint; wire only
this family (no others); run tsc + check:chokepoints; test each mode (validate, then one
gen); report per-mode pass/fail; STOP and report if a schema contradicts the family doc
(the schema wins — reconcile, don't guess).

## NEXT
Say "next" for MP-01 (core scaffolding — the mode-aware machinery). Then MP-02 (Seedance),
MP-03 (Kling), etc. One family per session, verified before wired.
