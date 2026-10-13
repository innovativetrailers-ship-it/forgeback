# CINEMATIC FORGE — PRODUCTION FINAL WIRING
## Cursor Agent Prompt
### Every pending item resolved · Env vars · Migrations · Railway fix · Full system verification

---

## READ FIRST — WHAT THIS COVERS

This is the final production wiring prompt. It resolves every known pending issue from
the full build session and ensures the system is ready for real users. Execute in order.
Do not skip steps.

---

## STEP 1 — RAILWAY: RELINK TO passionate-dreams

This is a DASHBOARD ACTION, not a code change:

```
1. railway.app → Projects → bubbly-integrity
2. Find the 'forgecinema' service → Settings → Source
3. Disconnect the GitHub repo from this service (or delete service entirely)
4. Go to Projects → passionate-dreams
5. Select the worker service → Settings → Source → Connect repo → forgecinema
6. Set Start Command: npm run workers
7. Copy ALL env vars from bubbly-integrity to passionate-dreams (they are per-service)
8. Deploy → confirm build appears in passionate-dreams, not bubbly-integrity
```

**Env vars required on Railway (passionate-dreams):**
```env
DATABASE_URL=           # Neon/Supabase Postgres with pgvector enabled
REDIS_URL=              # Upstash Redis (rediss:// — TLS required)
FAL_API_KEY=            # all FAL video/image/audio models
ANTHROPIC_API_KEY=      # Claude orchestration + cognitive director
XAI_API_KEY=            # Grok Imagine Video (xAI direct)
RUNWAY_API_KEY=         # Runway Gen-4 camera control
ELEVENLABS_API_KEY=     # Voice synthesis + lip sync
SUNO_API_KEY=           # Music generation
VOYAGE_API_KEY=         # Embeddings for cognitive memory (voyageai.com)
NEXTAUTH_SECRET=        # Auth secret (same as Vercel)
R2_ACCOUNT_ID=          # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

---

## STEP 2 — VERCEL ENV VARS (confirm all present)

**Edit → Settings → Environment Variables on Vercel. Confirm ALL of these exist:**

```env
# Auth
NEXTAUTH_URL=https://forgecinema.vercel.app
NEXTAUTH_SECRET=

# Database
DATABASE_URL=           # same Postgres as Railway (shared DB)

# Queue
REDIS_URL=              # same Upstash as Railway (rediss://)

# AI Services
FAL_API_KEY=
ANTHROPIC_API_KEY=
XAI_API_KEY=
RUNWAY_API_KEY=
ELEVENLABS_API_KEY=
SUNO_API_KEY=
VOYAGE_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_FREE=
STRIPE_PRICE_PRO=
STRIPE_PRICE_STUDIO=
STRIPE_PRICE_ULTIMATE=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Location APIs
NEXT_PUBLIC_CESIUM_TOKEN=
MAPILLARY_API_KEY=

# Cognitive
NEXT_PUBLIC_APP_URL=https://forgecinema.vercel.app
```

After confirming: **Redeploy** to pick up any newly-added vars.

---

## STEP 3 — DATABASE MIGRATIONS (run on production)

```bash
# Enable pgvector (run once on your Postgres instance)
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run ALL pending migrations at once
npx prisma migrate deploy

# Regenerate client
npx prisma generate

# Confirm all tables exist:
psql $DATABASE_URL -c "\dt" | grep -E "User|RenderJob|EpisodicMemory|SemanticMemory|RoutingPolicy|ModelPerformance|RewardSignal|CraftRule|LocationPlate|SocialToken"
# All 10 should appear
```

---

## STEP 4 — SEED PRODUCTION DATA

```bash
# 1. Seed dev accounts (unlimited credits, ADMIN role)
npx prisma db seed
# Confirm: innovative.trailers@gmail.com and susi.tate@gmail.com exist with ADMIN role

# 2. Seed knowledge graph (craft rules for cognitive director)
npx tsx prisma/seed-cognition.ts
# Confirm: 10+ rows in CraftRule table
```

---

## STEP 5 — FIX: MODEL COUNCIL SHOWS ALL 17+ MODELS

Apply `CINEMA_three_fixes_cursor_prompt.md` if not already done. Verify:

```bash
grep -n "MODEL_COUNCIL_DISPLAY\|17\|21" src/lib/routing/engineRegistry.ts
# Expected: MODEL_COUNCIL_DISPLAY array with 17+ entries
```

If not present, the engineRegistry needs the full display map. Reference:
`CINEMA_three_fixes_cursor_prompt.md` → FIX 1.

---

## STEP 6 — FIX: /api/vault/location/list 500 ERROR

Apply `CINEMA_three_fixes_cursor_prompt.md` FIX 2 if not already done:

```bash
# Confirm LocationPlate model in schema:
grep "model LocationPlate" prisma/schema.prisma

# Confirm route has try/catch:
grep -n "try\|catch\|plates" src/app/api/vault/location/list/route.ts
```

The route MUST return `{ plates: [] }` with status 200 on any error — never a 500.

---

## STEP 7 — FIX: LEFT PANEL WIDTH

Apply `CINEMA_left_panel_refix_cursor_prompt.md` if not already done.

Run the diagnostic first (STEP 1 of that doc):
```bash
grep -rln "MODEL COUNCIL\|Model Council\|PARAMETERS\|Target Duration" src/ --include="*.tsx"
```

The found file is the one to fix. Confirm after fix:
```bash
# Width should be controlled via inline style (not className w-72):
grep -n "style.*width\|panelWidth" src/components/[found-file].tsx
# Expected: panelWidth state + inline style={{ width: panelWidth }}
```

---

## STEP 8 — FIX: SLIDER-VERTICAL DEPRECATION

```bash
grep -rn "slider-vertical\|appearance.*slider" src/ --include="*.tsx" --include="*.css"
# Replace every occurrence with:
# style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
```

---

## STEP 9 — WIRE: FORGE EXTREME DOWNLOAD BUTTON

Apply `CINEMA_forge_extreme_download_cursor_prompt.md`:

```bash
# Verify nav bar has the download button:
grep -rn "ForgeExtremeButton\|Forge Extreme\|/download" src/components --include="*.tsx"
# Expected: ForgeExtremeButton referenced in the nav bar

# Verify download page exists:
ls src/app/download/page.tsx

# Verify tier API exists:
ls src/app/api/user/tier/route.ts
```

---

## STEP 10 — WIRE: COGNITIVE DIRECTOR INTEGRATION

Apply `CINEMA_cognitive_integration_cursor_prompt.md` — wire the two seams:

```bash
# Confirm STEP 1 discovery was done:
grep -rln "render.worker\|orchestrate.*job\|orchestrateGeneration" src/ --include="*.ts"

# Confirm think() is imported in the worker:
grep -n "think\|runCognitiveDirector" src/**/*.worker.ts src/workers/*.ts 2>/dev/null

# Confirm learn() fires after generation:
grep -n "learn\|runLearningLoop" src/**/*.worker.ts src/workers/*.ts 2>/dev/null
```

If not wired: the cognitive integration doc's SEAM 1 (think before orchestration) and
SEAM 2 (learn after render) need to be applied. Graceful degradation is mandatory —
both must be wrapped in try/catch so a cognitive failure never blocks a render.

---

## STEP 11 — WIRE: PLAYBACK SYSTEM

Apply `CINEMA_playback_system_cursor_prompt.md`:

```bash
# Confirm playback store exists:
ls src/store/playbackStore.ts

# Confirm PreviewPlayer and TransportControls exist:
ls src/components/playback/PreviewPlayer.tsx
ls src/components/playback/TransportControls.tsx
ls src/components/playback/RenderViewer.tsx
ls src/components/playback/CGIViewer.tsx

# Confirm job-completion handler pushes clips to timeline:
grep -rn "addClip\|setClips\|playbackStore" src/components --include="*.tsx"
```

The single most important check: open the editor, generate a 5-second clip, and
confirm it **plays in the preview pane** (not "No content at playhead").

---

## STEP 12 — GOOGLE AUTH FIX

If Google sign-in still fails:

```bash
# 1. Run migrations (Step 3 above) — image/role/tier columns must exist
# 2. Harden the session callback:
grep -n "session.*callback\|role.*USER\|tier.*free" src/app/api/auth/\[...nextauth\]/route.ts
```

The session callback must have try/catch and a safe fallback:
```typescript
async session({ session, user }) {
  try {
    if (session.user) {
      session.user.id   = user.id
      session.user.role = (user as any).role ?? 'USER'
      session.user.tier = (user as any).subscriptionTier ?? 'free'
    }
  } catch { /* never crash auth */ }
  return session
},
```

---

## STEP 13 — STRIPE PRODUCTS

If credits/purchase returning 400/500:

```bash
# Confirm price IDs are set on Vercel:
# STRIPE_PRICE_FREE, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO, STRIPE_PRICE_ULTIMATE
# These are created in the Stripe dashboard — see CINEMA_stripe_setup.md
# Then added to Vercel env vars → Redeploy
```

---

## STEP 14 — FULL SYSTEM TEST

```bash
npx tsc --noEmit   # MUST pass with zero new errors

# 1. Auth: sign in with Google → workspace loads
# 2. Credits: /api/credits/balance → returns { balance: N }
# 3. Generate simple clip (draft tier, 5s)
#    → /api/generate returns { jobId } in < 2 seconds
#    → Worker processes job (Railway logs show activity)
#    → /api/jobs/[id] climbs: QUEUED → PROCESSING → COMPLETED
#    → Clip appears in preview pane and plays
# 4. AI Director: open → all 17+ models in Model Council picker
# 5. Location: search any city → street photos load, no 500 error
# 6. Panel width: switch to AI Director tab → ≥360px wide, labels readable
# 7. Console: zero slider-vertical warnings, zero JSON parse errors
# 8. Forge Extreme: Ultimate user → teal download button in nav
#    Non-Ultimate user → greyed lock button → upgrade modal opens
# 9. Stripe: visit /upgrade → pricing displays → select plan → Stripe checkout opens
# 10. Cognitive: generate Director-mode film → worker logs show "The director is thinking..."
```

---

## STEP 15 — PRODUCTION HEALTH CHECKS (after deploy)

```bash
# Check cognitive memory is working:
curl https://forgecinema.vercel.app/api/health/cognition \
  -H "x-user-role: ADMIN"
# Expected: { agents: {...}, memory: { episodic: N, semantic: N }, routing: {...} }

# Check services are reachable:
curl https://forgecinema.vercel.app/api/health/services
# Expected: all services listed with status

# Railway worker health: watch logs for startup
# Expected: "[workers] All processors registered"
#           "[cognition] knowledge graph seeded"
```

---

## PENDING ITEMS THAT REQUIRE MANUAL STEPS (not Cursor)

These cannot be automated via Cursor — they require dashboard/account actions:

| Item | Action | Docs |
|---|---|---|
| Railway project relink | Dashboard: disconnect bubbly-integrity, connect passionate-dreams | Step 1 above |
| Stripe product creation | Stripe dashboard → create 4 products + price IDs | CINEMA_stripe_setup.md |
| FAL API key | fal.ai/dashboard → create key | CINEMA_account_registration_reference.md |
| Anthropic API key | console.anthropic.com | same |
| Runway API key | dev.runwayml.com | same |
| xAI API key | console.x.ai | same |
| ElevenLabs API key | elevenlabs.io | same |
| Suno API key | suno.com | same |
| Voyage AI API key | voyageai.com → for cognitive embeddings | same |
| pgvector enable | `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"` | Step 3 |
| Forge Extreme download URLs | Update DOWNLOAD_URLS in download/page.tsx once V3 builds exist | Step 2 of download doc |

---

## COMPLETE CURSOR FEED ORDER (reference)

```
V2 Foundation (already applied to running codebase):
  1.  CINEMA_prisma_schema_update
  2.  CINEMA_fal_consolidation_cursor_prompt
  3.  CINEMA_todays_fixes_cursor_prompt
  4.  CINEMA_service_wiring_cursor_prompt
  5.  CINEMA_grok_video_cursor_prompt
  6.  CINEMA_remove_paypal_cursor_prompt
  7.  CINEMA_access_tiers_cursor_prompt
  8.  CINEMA_tier_gating_cursor_prompt
  9.  CINEMA_ui_layout_fixes_cursor_prompt
 10.  CINEMA_left_panel_refix_cursor_prompt
 11.  CINEMA_three_fixes_cursor_prompt          ← Active bugs — feed if not applied
 12.  CINEMA_location_system_cursor_prompt
 13.  CINEMA_sfx_makeup_cursor_prompt
 14.  CINEMA_ui_workers_completion

Orchestration cluster:
 15.  CINEMA_orchestration_v2_cursor_prompt     ← foundation
 16.  CINEMA_timeout_progress_cursor_prompt
 17.  CINEMA_vendor_progress_cursor_prompt
 18.  CINEMA_asset_seed_parallel_cursor_prompt
 19.  CINEMA_timeout_increase_cursor_prompt     ← last in cluster

Cognitive system:
 20.  CINEMA_cognitive_director_cursor_prompt
 21.  CINEMA_cognitive_enhancements_cursor_prompt
 22.  CINEMA_cognitive_backend_final
 23.  CINEMA_cognitive_integration_cursor_prompt  ← STEP 1 discovery first

Playback + features:
 24.  CINEMA_playback_system_cursor_prompt
 25.  CINEMA_forge_extreme_download_cursor_prompt ← new

V3 Desktop (separate codebase):
 16.  CINEMA_V3_MASTER_ARCHITECTURE.md
 17.  CINEMA_V3_model_expansion_cursor_prompt     ← new — feed before cursor prompt
 18.  CINEMA_V3_CURSOR_PROMPT.md
 19.  CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM
 20.  CINEMA_V3_VFX_EFFECTS_ADDENDUM
 21.  CINEMA_V3_PLAYER_RENDERER_ADDENDUM
 22.  CINEMA_V3_API_REFERENCE_ADDENDUM

Verification (use as checklists, not feeds):
     CINEMA_orchestration_build_verification
     CINEMA_production_final_cursor_prompt   ← THIS DOCUMENT
```
