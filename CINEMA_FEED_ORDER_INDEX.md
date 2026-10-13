# CINÉMA — Canonical Cursor Feed Order (Index)

> Internalised build/feed sequence. **Index only — do not auto-build.**
> Source docs live in `~/Downloads/files-2/` and are mirrored in the repo root `~/cinema/cinema/`.
> Last indexed: 2026-06-03.

---

## V2 WEB APP — Consciousness onward (docs 1–7)

| # | Doc | What it lands | Prereq / gate before feeding |
|---|-----|---------------|------------------------------|
| 1 | `CINEMA_cognitive_director_cursor_prompt` | CoALA 4-memory system; intent / affect / ideate / reflect agents | `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"` then `npx prisma migrate dev --name cognitive_memory` |
| 2 | `CINEMA_cognitive_enhancements_cursor_prompt` | Live performance matrix, schema-driven payloads, continuity state, reward signals, knowledge graph | `npx prisma migrate dev --name cognitive_enhancements` (doc's own migration is `--name model_performance_matrix`); doc 1 complete |
| 3 | `CINEMA_cognitive_backend_final` | Agent runtime, working memory (Redis), **async `buildDAG` fix**, unified worker integration, health endpoint, `seedAll()` | ⚠️ Contains the async DAG fix — `tsc` fails without it. Then `npx tsx prisma/seed-cognition.ts` |
| 4 | `CINEMA_cognitive_integration_cursor_prompt` | Wires `think()` → render → `learn()` at **exactly 2 seams** in the real worker | Run STEP 1 discovery greps yourself FIRST; note real worker path + orchestration fn name. Test: `unset VOYAGE_API_KEY` → render must still complete (graceful degradation) |
| 5 | `CINEMA_playback_system_cursor_prompt` | Timeline engine, PreviewPlayer, TransportControls, RenderViewer, CGI/3D viewer; fixes "No content at playhead"; wire job-completion → `playbackStore` | Must exist before doc 6 |
| 6 | `CINEMA_interactive_player_cursor_prompt` | WebGL grade shader, lasso select, AI object removal, IC-Light relight, defect correction, gore FX. Wraps PreviewPlayer | Doc 5 required first |
| 7 | `CINEMA_forge_extreme_download_cursor_prompt` | Ultimate-gated nav button, `/download` page, `/api/user/tier`, upgrade modal, pricing callout | — |

## V3 DESKTOP APP — Separate Electron codebase (docs 8–14)

> Keep in a **separate Cursor session**. Do not mix with the V2 web app.

| # | Doc | What it lands | Note |
|---|-----|---------------|------|
| 8  | `CINEMA_V3_MASTER_ARCHITECTURE` | What V3 is — all 9 feature groups A–I, full tech stack | Feed first in V3 |
| 9  | `CINEMA_V3_model_expansion_cursor_prompt` | ⚠️ Expands 12-model placeholder → **21 models**; fills `CASTING_DIRECTOR_SYSTEM_PROMPT` | Must go BEFORE doc 10, or Sprint 25 builds with 12 models only |
| 10 | `CINEMA_V3_CURSOR_PROMPT` | 45 sprints, full Electron build instructions | — |
| 11 | `CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM` | Forge Spectrum EQ (20-band), 9-stage Master Suite, Forge Micro Colour, skin-tone tools | — |
| 12 | `CINEMA_V3_VFX_EFFECTS_ADDENDUM` | 200+ pre-rendered effects library, AI VFX generator | — |
| 13 | `CINEMA_V3_PLAYER_RENDERER_ADDENDUM` | WebGPU renderer, hard perf contracts (<16ms 1080p) | Supersedes Sprint 4 player spec in doc 10 |
| 14 | `CINEMA_V3_API_REFERENCE_ADDENDUM` | Verified 2026 API endpoints, keychain storage patterns | — |

## FINAL — Both codebases (doc 15)

| # | Doc | What it lands |
|---|-----|---------------|
| 15 | `CINEMA_production_final_cursor_prompt` | **Feed absolutely last** — after all V2 + V3 docs applied. Railway relink, env vars, migrations, seeds, full system test. Verifies all 21 models, no deprecated features, no broken wiring |

---

## Hard gates (do these manually, in order)

1. **Before doc 1:**
   ```bash
   psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
   npx prisma migrate dev --name cognitive_memory
   ```
2. **Before doc 4:** run the STEP 1 discovery greps in that doc yourself; record the real worker file path + orchestration function name; feed those into the prompt. (Skipping this is the most likely way to break wiring.)
3. **Doc 9** must precede **doc 10** (else V3 ships with 12 models).
4. **Doc 7 (web)** and the **V3 docs** stay in separate Cursor sessions.

---

## Model expansion — the 4 new models (target = 21 total)

| id | role | dot |
|----|------|-----|
| `sora-2` | primary route for `physics_simulation` | — |
| `happyhorse-1.0` | leads `dialogue_closeup` | — |
| `kling-o3` | leads `character_emotion` | — |
| `hailuo-2.3` | joins `cgi_character` | — |

No model removed, no feature deprecated.

---

## ✅ MODEL GAP — RESOLVED IN LIVE CODE (2026-06-04)

The 4 new models were patched directly into the **live V2 source** (not just the prompt docs), reaching the 21-model target:

- `src/lib/routing/engineRegistry.ts` — added to `MODEL_COSTS`, `MODEL_SPECIALTIES`, `MODEL_COUNCIL_DISPLAY` (now 21 entries), and `FAL_MODEL_IDS` (3 FAL models; `sora-2` excluded — Replicate).
- `src/lib/orchestration/dagRouter.ts` — `CONTENT_ROUTING` leads updated: `sora-2`→`physics_simulation`, `happyhorse-1.0`→`dialogue_closeup`, `kling-o3`→`character_emotion`, `hailuo-2.3` joins `cgi_character`.
- `src/lib/orchestration/bridgedGeneration.ts` — `T2V_MODEL_IDS`/`I2V_MODEL_IDS` + timeouts for the 3 FAL models; `sora-2` runs via a new Replicate path (`openai/sora-2`, needs `REPLICATE_API_TOKEN`), degrading to LTX fallback if unset.

> Note: the prompt docs `CINEMA_three_fixes_cursor_prompt.md` / `CINEMA_orchestration_v2_cursor_prompt.md` were NOT edited (they are historical feed prompts) — the live code is the source of truth and is now correct.
