# FULL CONTROL SPEC — INDEX & CONVENTIONS
# Complete specification of all 340 controls across 10 systems, built as bounded,
# self-contained chunks. Each chunk = one system, detailed enough to implement from.
# Build order in the docs ≠ build order in reality — this is the COMPLETE spec;
# the FINAL-AUDIT-VERDICT queue governs what to build WHEN.

═══════════════════════════════════════════════════════════════════════
# THE CHUNKS (one spec doc per system — feed to Cursor individually)
═══════════════════════════════════════════════════════════════════════
| # | Doc | System | Controls | Audit status |
|---|---|---|---|---|
| 00 | this | Index + conventions | — | — |
| 01 | SPEC-01-generation-camera | Generation & camera | 24 | 16W 2U 0S 6A |
| 02 | SPEC-02-color-grading | Color & grading | 74 | 37W 0U 0S 37A |
| 03 | SPEC-03-lighting-shading | Lighting & shading | 28 | 8W 0U 1S 19A |
| 04 | SPEC-04-editing-nle | Editing / NLE | 38 | 22W 1U 5S 10A |
| 05 | SPEC-05-vfx-compositing | VFX & compositing | 36 | 21W 1U 2S 12A |
| 06 | SPEC-06-cgi-overlays | CGI & overlays | 29 | 9W 1U 1S 18A |
| 07 | SPEC-07-audio | Audio | 56 | 19W 0U 4S 33A |
| 08 | SPEC-08-style-look | Style / look / genre | 11 | 8W 0U 1S 2A |
| 09 | SPEC-09-production-delivery | Production & delivery | 27 | 21W 0U 1S 5A |
| 10 | SPEC-10-llm-intelligence | LLM / intelligence | 18 | 14W 0U 0S 4A |
Total: 340 controls. (W=wired U=ui-only S=stub A=absent, from the final audit.)

═══════════════════════════════════════════════════════════════════════
# CONVENTIONS — every control in every chunk follows this format
═══════════════════════════════════════════════════════════════════════
Each control is specified as:
```
### <Control name>   [STATUS: WIRED | UI-ONLY | STUB | ABSENT]
- PURPOSE: what it does for the user, one line.
- UI: the control type + range/options + precision (slider 0–100 @1, enum, toggle,
  canvas, numeric field). For WIRED, the current range; the SPEC range if it differs.
- DATA: the field(s) it reads/writes (entity.field), the type, the default.
- BACKEND: how it reaches output — the API param, the FFmpeg filter, the export
  mapping, or the model payload field. For absent controls: the intended mechanism.
- WIRING: UI handler → store/adapter → route/job → output. The full path.
- ACCEPTANCE: how you verify it works (the test).
- STATUS NOTE: for WIRED, any gap (range mismatch, precision); for UI-ONLY/STUB,
  what's missing; for ABSENT, the build sketch.
- TIER: 0/1/2/3 from the master queue (billing / silent-drop / cheap-win / depth).
```

## GLOBAL RULES every chunk inherits (stated once here, referenced everywhere)
1. CHOKEPOINT: any control that calls a paid API (FAL/Anthropic/ElevenLabs/Tripo/
   Runway/Suno) routes through the gated submit (providerSubmit / claudeCall /
   llmCall), pause-aware, source-attributed. NO control bypasses this. (Tier 0.)
2. SINGLE STORE: any control touching timeline clips writes the ONE unified store.
3. SCHEMA-DRIVEN: any model payload param is derived from the model's live schema
   (buildPayload), never hardcoded. Ranges/enums come from the schema.
4. HONEST UI: a control's UI must not imply precision/capability the backend lacks.
   If the backend is coarse, the UI is coarse. No sliders that map to 3 buckets.
5. STRUCTURED INTENT: camera/style/character intent is stored as DATA (structured
   objects), rendered to prompt now, so alternate renderers (post-production, new
   API params) wire later without a rewrite.
6. DESKTOP/WEB: WIRED-on-one-host controls note the other host's state. The spine
   is shared (@cinema/core); only the adapter differs. Heavy controls = desktop-only.

## HOW EACH ABSENT CONTROL IS SPEC'D (so "full spec" is real, not hand-waving)
An absent control gets the SAME format, with BACKEND + WIRING as a concrete BUILD
SKETCH: the exact FFmpeg filter / API param / DSP approach, the data field to add,
the handler to write, and the acceptance test. Detailed enough that Cursor could
build it — but TIER-3 tagged so it's built on demand, not now.

## DRIFT CONTROL (how these stay consistent)
- Every chunk imports these conventions by reference; no chunk redefines them.
- Every chunk ends with a "cross-refs" note linking controls that share data
  (e.g. camera intent appears in Gen, VFX, and the control-layer moat).
- The audit's file:line evidence is carried into each WIRED/STUB/UI-ONLY control
  so the spec points AT the real code.
- Ranges/enums for model params say "from live schema" not a guessed number, per
  rule 3 — avoids the Forge-Micro-range-mismatch problem the audit found.

## NEXT
Say "next" to build SPEC-01 (Generation & camera, 24 controls). Then 02–10, one
per turn. Each is self-contained and Cursor-ready.
