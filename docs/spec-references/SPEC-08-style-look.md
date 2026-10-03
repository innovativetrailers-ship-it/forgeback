# SPEC-08 — STYLE / LOOK / GENRE (11 controls)
# Inherits SPEC-00. Audit: 8 WIRED / 0 UI-ONLY / 1 STUB / 2 ABSENT.
# Small chunk. Has a real Tier-1 bug (style chip dropped when notes empty) and a
# high-value cheap win (20 LUTs + apply route exist, no UI). Entity: director prompt
# + ClipEffects (film-stock/grain/halation are grade presets).

═══════════════════════════════════════════════════════════════════════
# GROUP A — STYLE PRESETS (with the drop bug)
═══════════════════════════════════════════════════════════════════════

### Style presets (chips)   [WIRED — DROP BUG → TIER 1]
- PURPOSE: set the film's overall style (Cinematic Drama/Action/Documentary/Music
  Video/Commercial/Horror).
- UI: six chips (AIDirectorPanel.tsx:17).
- BUG: the chip id is written into the director prompt ONLY when the notes box is
  non-empty (:94). Empty notes → the script goes alone, the chosen STYLE IS DROPPED.
  The chip stays lit, giving no indication it was ignored.
- FIX (TIER 1 — silent-drop bug): always include the selected style id in the
  director prompt when a chip is active, regardless of the notes box. One condition.
- ACCEPTANCE: pick Horror, leave notes empty, Direct → the prompt carries the horror
  style; output reflects it.
- TIER: 1.

### Animation / News styles   [ABSENT → TIER 3]
- Not in the chip list; no style_key column. UI: (build) add two chips. DATA: add
  a style_key field (also referenced in SPEC-10 ShotAnalysis.styleKey). BACKEND:
  same prompt-append path as the other chips. TIER 3 (trivial when wanted).

═══════════════════════════════════════════════════════════════════════
# GROUP B — GENRE LUT PACK (the cheap win)
═══════════════════════════════════════════════════════════════════════

### Genre LUT pack   [STUB → TIER 2 — CHEAP WIN]
- 20 named .cube files exist (LUTLoader.ts:61); GET /api/color/lut lists them and
  POST applies one (color/lut/route.ts:42). NOTHING in the UI calls the route.
- FIX: MOUNT a LUT panel — list the 20 LUTs (thumbnails), click to apply via the
  existing route. This IS the "genre LUT pack" feature; it's fully built server-side,
  just unexposed. Connect the two ends.
- STATUS NOTE: this is the genre-LUT gap the audit named — you have 20 LUTs, not
  zero; they're just not mounted. Cross-ref SPEC-02 (LUT/color science).
- ACCEPTANCE: the LUT panel lists 20 LUTs; applying one changes the exported grade.
- TIER: 2 (cheap, high-value — built-but-unmounted).

═══════════════════════════════════════════════════════════════════════
# GROUP C — FILM STOCK EMULATION (wired as grade presets)
═══════════════════════════════════════════════════════════════════════

### Vision3   [WIRED]  (primary grade + grain 14, EffectsPanel.tsx:109). TIER: —.
### Eterna   [WIRED]  (grade + grain 10, :110). TIER: —.
### Portra   [WIRED]  (grade + grain 12, :108). TIER: —.
### HP5   [ABSENT — naming → TIER 3]
- Ilford HP5 is a name in the unused cube list (LUTLoader.ts:67); the desktop stock
  row uses Tri-X instead (:111). FIX: cosmetic — either add an HP5 preset or accept
  Tri-X as the B&W stock and update the spec/label. NOT a real gap (B&W stock
  emulation works; one stock is named differently). TIER 3 (naming).
- NOTE: these are GRADE PRESETS, not loaded film-stock LUTs. A future enhancement:
  back them with real scanned-stock .cube LUTs (once the LUT panel exists, Group B).

### Grain   [WIRED]  (0…100, FFmpeg noise, EffectsPanel.tsx:2646). TIER: —.
### Halation   [WIRED]  (0…100, isolate+blur+warm-tint+screen, :3307). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP D — AI LOOK
═══════════════════════════════════════════════════════════════════════

### AI grade suggestion   [WIRED]  (style menu cinematic/documentary/horror/commercial/
  period → Suggest returns lift/gamma/gain/primaries; Apply writes them, EffectsPanel.
  tsx:2666/2710). Uses a model → confirm gated (rule 1 / Tier-0 sweep). TIER: — (verify gating).

### Noise reduction   [WIRED — coarse → TIER 3]
- One 0…100 slider drives hqdn3d spatial+temporal luma+chroma (colorFilter.ts:291).
  No separate temporal/spatial/chroma knobs. FIX (enhancement): split into 3 knobs.
  Works as one amount now. TIER 3 (enhancement).

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
TIER 1 (bug): style-chip drop when notes empty — always include the active chip.
TIER 2 (cheap win): MOUNT the LUT panel — 20 LUTs + apply route already exist; this
  IS the genre-LUT feature, just unexposed.
TIER 3 (minor/enhancement): Animation/News chips + style_key; HP5 naming; split NR
  knobs; back film-stock presets with real scanned LUTs.
CONSOLIDATION: the LUT panel (Group B) + film-stock LUT backing (Group C) share the
  existing LUT apply pipeline (SPEC-02). style_key ties to SPEC-10 routing. AI grade
  suggestion needs the Tier-0 gating confirm.

## CROSS-REFS
- LUT panel + film-stock LUTs → SPEC-02 (LUT/color science, same apply pipeline).
- style_key → SPEC-10 (ShotAnalysis.styleKey routing dimension).
- AI grade suggestion gating → rule 1 / Tier-0 sweep.
- Style-drop bug → TIER-1 silent-drop queue (FINAL-AUDIT-VERDICT).

## NEXT
Say "next" for SPEC-09 (Production & delivery, 27 controls).
