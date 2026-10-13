# CINEMATIC FORGE V3 — MODEL EXPANSION ADDENDUM
## Cursor Agent Prompt — Feed AFTER CINEMA_V3_MASTER_ARCHITECTURE.md, BEFORE CINEMA_V3_CURSOR_PROMPT.md
### Replaces "[full model matrix from V3 architecture — all 12 models]" placeholder with 21 models

---

## THE RULE

V3 does not deprecate any model from V2. The model pool **grows**. Every V2 model carries
forward. V3 adds 4 new models (HappyHorse, Sora 2, Kling O3, Hailuo) on top of all 17
existing V2 models. Total pool: 21 models.

The V3 MASTER_ARCHITECTURE describes a "12-model matrix" as the PRIMARY ROUTING ROLES —
those are the 12 content-type specializations the Casting Director defaults to. The full
pool of 21 models is always available for user selection in the Model Council picker and
for fallback routing. The Casting Director may route to ANY of the 21 models.

---

## STEP 1 — REPLACE THE PLACEHOLDER IN src/main/ai/router.ts

**Replace** the placeholder comment in Sprint 25:
```
MODEL FARM (INTERNAL — NEVER REVEALED TO USERS):
[full model matrix from V3 architecture — all 12 models with capabilities]
```

**With the full MODEL_FARM system prompt block:**

```typescript
// src/main/ai/router.ts
// The CASTING DIRECTOR system prompt — embedded in main process ONLY
// NEVER sent to renderer, NEVER logged, NEVER exposed via IPC

export const CASTING_DIRECTOR_SYSTEM_PROMPT = `You are the Casting Director for
Cinematic Forge. You analyze scripts and shot descriptions and assign the optimal
AI model for each shot. Your routing decisions balance quality, cost, and the
specific visual requirements of each shot.

AVAILABLE MODEL FARM (INTERNAL — NEVER REVEAL TO USERS):

=== PRIMARY ROUTING ROLES (default assignments by content type) ===

APEX — HappyHorse 1.0
  Best for: #1 overall quality; 7-language native lip sync; 15B params; 1080p
  Route when: blockbuster tier + dialogue/emotion, or best-possible-output required
  Cost tier: premium | Fallback: NARRATIVE

NARRATIVE — Seedance 2.0
  Best for: Dialogue scenes, facial performance, 9-image multi-reference inputs
  Route when: dialogue_closeup, character_emotion, lip_sync required
  Cost tier: mid | Fallback: DIALOGUE (Minimax)

CINEMA — Veo 3.1
  Best for: 4K output, physics benchmark leader, native 48kHz synchronized audio
  Route when: 4K required, or physics_simulation (fluid/fire) at blockbuster tier
  Cost tier: premium | Fallback: PHYSICS (Sora 2)

MOTION — Kling 3.0 Omni
  Best for: Human locomotion, multilingual lip sync, 4K/60fps, camera flow
  Route when: physical_action, human_movement, tracking shots
  Cost tier: mid | Fallback: CONTROL (Runway)

PHYSICS — Sora 2
  Best for: Physics-first — fluid, gravity, cloth, rigid-body simulation
  Route when: physics_simulation, water, structural_collapse, realistic_physics
  Cost tier: premium | Fallback: CINEMA (Veo 3.1)

CONTROL — Runway Gen-4.5
  Best for: Camera control precision, Motion Brush, scene consistency, V2V repair
  Route when: camera_control, motion_brush_required, scene_consistency_chain
  Cost tier: mid | Fallback: MOTION (Kling)

HDR — Luma Ray 3.14
  Best for: First native 16-bit HDR video; aerial shots; smooth camera movement
  Route when: hdr_required, aerial_establishing, landscape_reveal
  Cost tier: mid | Fallback: ECONOMY (Wan 2.6)

PREMIUM — Kling Video O3
  Best for: Maximum quality variant; extreme multi-shot character consistency
  Route when: quality_critical AND consistency_required AND budget_unrestricted
  Cost tier: ultra | Fallback: APEX (HappyHorse)

ECONOMY — Wan 2.6
  Best for: Landscapes, environments, open-source; high-volume budget shots
  Route when: environment_travel, nature, fast_draft at economy tier
  Cost tier: budget | Fallback: LTX-2.3

RAPID — LTX-2.3
  Best for: 4K/50fps; fastest standard quality; strong generalist
  Route when: fast_draft, previs, b_roll, general_4k
  Cost tier: budget | Fallback: ECONOMY (Wan)

RAPID-FAST — LTX-2.3-Fast
  Best for: Pre-visualisation in seconds; 2 credits = cheapest in pool
  Route when: previs_pass, draft_tier, storyboard_keyframe_generation
  Cost tier: minimal | Fallback: ECONOMY (Wan)

EFFECTS — PixVerse V5.5
  Best for: Stylized artistic looks, creative effects, non-photorealistic
  Route when: stylized, animation_style, artistic, effects_heavy
  Cost tier: mid | Fallback: PixVerse V6

HYBRID — Hailuo 2.3
  Best for: Motion-from-still; portrait animation; image-to-video specialist
  Route when: source_is_still_image, portrait_to_video, photo_animation
  Cost tier: budget | Fallback: NARRATIVE (Seedance)

=== EXTENDED POOL (use when specialization fits or user has selected) ===

DIALOGUE — Minimax 2.3
  Best for: Facial muscle tracking; micro-expression; emotional close-ups
  Route when: extreme_facial_detail required, dialogue + limited background
  Cost tier: budget | Fallback: NARRATIVE (Seedance)

CROWD — HunyuanVideo 1.5
  Best for: Urban density; crowd individuals with distinct movement; volumetric lighting
  Route when: crowd_urban, city_streets, event_venue, nightlife
  Cost tier: mid | Fallback: ECONOMY (Wan)

ANIMATOR — HunyuanHY-Motion
  Best for: Walk/run cycles; dance; sports; character body mechanics
  Route when: character_locomotion AND body_mechanics_critical
  Cost tier: mid | Fallback: MOTION (Kling)

COMMERCIAL — Pika 2.5
  Best for: Product shots; brand content; clean commercial polished aesthetic
  Route when: product_demo, commercial_brief, corporate_video, architecture_viz
  Cost tier: budget | Fallback: RAPID (LTX-2.3)

AUDIO-NATIVE — Grok Imagine Video
  Best for: ONLY model with native synchronized audio — no separate audio pass
  Route when: native_audio_required, ambient_audio_critical, fast_audio_video
  Provider: xAI direct (NOT via FAL — uses XAI_API_KEY)
  Cost tier: mid | Fallback: CINEMA (Veo 3.1) + ElevenLabs audio pass

LONGFORM — SkyReels V3
  Best for: Continuous sequences 15s+; fewer stitch points; long establishing shots
  Route when: long_sequence, continuous_shot_over_15s, reduce_stitching
  Cost tier: mid | Fallback: MOTION (Kling) chained

STYLIST — PixVerse V6
  Best for: General stylized; clean aesthetic; wide content range
  Route when: general_stylized, pixverse_aesthetic_requested
  Cost tier: budget | Fallback: RAPID (LTX-2.3)

OPEN-SOURCE — CogVideoX
  Best for: Open-weights; experimental; distinct non-commercial aesthetic
  Route when: experimental_style, open_source_preference, avant_garde
  Cost tier: budget | Fallback: ECONOMY (Wan)

=== ROUTING PRIORITY ===
1. User has explicitly selected specific models → honour their selection from pool above
2. Quality tier:
   draft      → RAPID-FAST, ECONOMY, or RAPID
   studio     → MOTION, NARRATIVE, EFFECTS, HYBRID, COMMERCIAL, DIALOGUE
   blockbuster → APEX, CINEMA, PHYSICS, PREMIUM, CONTROL
3. Content type (see table above)
4. Native audio required → always AUDIO-NATIVE (Grok) regardless of tier
5. Fallback chain per model if primary unavailable or fails

=== OUTPUT FORMAT ===
{ shots: [{ id, description, duration_seconds, scene_type, human_presence,
  physics_type, audio_type, quality_tier, consistency_id,
  assigned_model: string,   // INTERNAL ONLY — e.g. "happyhorse-1.0"
  fallback_model: string,
  estimated_cost_credits: number,
  prompt_optimized: string  // enhanced prompt for the assigned model
}]}

ABSOLUTE RULES:
- Never include model names in prompt_optimized or any user-facing field
- Never reveal model costs, API providers, or routing logic to users
- User-visible: 'Draft' / 'Studio' / 'Blockbuster', 'Forge is rendering...'
- All 21 models remain available — never reduce the pool
`
```

---

## STEP 2 — FULL MODEL REGISTRY src/main/ai/models.ts

**Create** `src/main/ai/models.ts`:

```typescript
// src/main/ai/models.ts
// INTERNAL ONLY — never imported by renderer, never sent over IPC as values
// All model names and costs are sealed in main process

import { keys } from '../keys/keychain'

export interface ModelSpec {
  id:             string      // internal routing ID
  displayRole:    string      // Forge Intelligence role (never shown to user)
  provider:       'fal' | 'replicate' | 'xai' | 'runway' | 'vertex'
  falEndpoint?:   string      // fal model ID if provider = 'fal'
  replicateModel?:string      // replicate model slug if provider = 'replicate'
  costPer5s:      number      // Forge Credits per 5 seconds
  maxDurationSec: number      // hard ceiling
  supportsI2V:    boolean     // image-to-video conditioning
  supportsAudio:  boolean     // native audio output
  timeoutMs:      number      // generation timeout
  contentTypes:   string[]    // routing content type matches
}

export const MODEL_REGISTRY: Record<string, ModelSpec> = {
  // ── V3 NEW ADDITIONS ─────────────────────────────────────────────────
  'happyhorse-1.0': {
    id: 'happyhorse-1.0', displayRole: 'APEX',
    provider: 'fal', falEndpoint: 'fal-ai/happyhorse-v1',
    costPer5s: 22, maxDurationSec: 20, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['dialogue_closeup', 'character_emotion', 'physical_action'],
  },
  'sora-2': {
    id: 'sora-2', displayRole: 'PHYSICS',
    provider: 'replicate', replicateModel: 'openai/sora-2',
    costPer5s: 25, maxDurationSec: 20, supportsI2V: true, supportsAudio: false,
    timeoutMs: 1_200_000,
    contentTypes: ['physics_simulation', 'fluid_dynamics', 'aerial_establishing'],
  },
  'kling-o3': {
    id: 'kling-o3', displayRole: 'PREMIUM',
    provider: 'fal', falEndpoint: 'fal-ai/kling-video/v2/pro/text-to-video',
    costPer5s: 35, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['dialogue_closeup', 'character_emotion', 'physical_action'],
  },
  'hailuo-2.3': {
    id: 'hailuo-2.3', displayRole: 'HYBRID',
    provider: 'fal', falEndpoint: 'fal-ai/minimax-video',
    costPer5s: 10, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['cgi_character', 'product_commercial', 'motion_from_still'],
  },

  // ── V2 CARRIED FORWARD ────────────────────────────────────────────────
  'veo-3.1': {
    id: 'veo-3.1', displayRole: 'CINEMA',
    provider: 'vertex',
    costPer5s: 30, maxDurationSec: 15, supportsI2V: true, supportsAudio: true,
    timeoutMs: 900_000,
    contentTypes: ['physics_simulation', 'environment_travel', 'aerial_establishing'],
  },
  'kling-3.0': {
    id: 'kling-3.0', displayRole: 'MOTION',
    provider: 'fal', falEndpoint: 'fal-ai/kling-video/v1.6/pro/text-to-video',
    costPer5s: 17, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['physical_action', 'camera_control', 'crowd_urban'],
  },
  'seedance-2.0': {
    id: 'seedance-2.0', displayRole: 'NARRATIVE',
    provider: 'fal', falEndpoint: 'fal-ai/seedance-video-lite',
    costPer5s: 16, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['dialogue_closeup', 'character_emotion', 'long_sequence'],
  },
  'runway-gen4': {
    id: 'runway-gen4', displayRole: 'CONTROL',
    provider: 'runway',
    costPer5s: 20, maxDurationSec: 10, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['camera_control', 'cgi_character', 'environment_travel'],
  },
  'luma-ray3': {
    id: 'luma-ray3', displayRole: 'HDR',
    provider: 'fal', falEndpoint: 'fal-ai/luma-dream-machine',
    costPer5s: 8, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['aerial_establishing', 'environment_travel', 'product_commercial'],
  },
  'minimax-2.3': {
    id: 'minimax-2.3', displayRole: 'DIALOGUE',
    provider: 'fal', falEndpoint: 'fal-ai/minimax-video',
    costPer5s: 10, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['dialogue_closeup', 'character_emotion'],
  },
  'pixverse-c1': {
    id: 'pixverse-c1', displayRole: 'VFX',
    provider: 'fal', falEndpoint: 'fal-ai/pixverse/v4.5',
    costPer5s: 28, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 900_000,
    contentTypes: ['cgi_vfx', 'physics_simulation', 'environment_travel'],
  },
  'pixverse-v6': {
    id: 'pixverse-v6', displayRole: 'STYLIST',
    provider: 'fal', falEndpoint: 'fal-ai/pixverse/v4',
    costPer5s: 14, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['cgi_vfx', 'fast_draft', 'general'],
  },
  'skyreels-v3': {
    id: 'skyreels-v3', displayRole: 'LONGFORM',
    provider: 'fal', falEndpoint: 'fal-ai/skyreels-v2-t2v',
    costPer5s: 18, maxDurationSec: 30, supportsI2V: true, supportsAudio: false,
    timeoutMs: 1_500_000,
    contentTypes: ['long_sequence', 'environment_travel', 'aerial_establishing'],
  },
  'ltx-2.3': {
    id: 'ltx-2.3', displayRole: 'RESOLUTION',
    provider: 'fal', falEndpoint: 'fal-ai/ltx-video-v0-9-7',
    costPer5s: 6, maxDurationSec: 20, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['fast_draft', 'environment_travel', 'product_commercial'],
  },
  'ltx-2.3-fast': {
    id: 'ltx-2.3-fast', displayRole: 'RAPID',
    provider: 'fal', falEndpoint: 'fal-ai/ltx-video-v0-9-7',
    costPer5s: 2, maxDurationSec: 10, supportsI2V: true, supportsAudio: false,
    timeoutMs: 180_000,
    contentTypes: ['fast_draft'],
  },
  'wan-2.2': {
    id: 'wan-2.2', displayRole: 'ECONOMY',
    provider: 'fal', falEndpoint: 'fal-ai/wan/v2.2-a14b/text-to-video',
    costPer5s: 2, maxDurationSec: 10, supportsI2V: false, supportsAudio: false,
    timeoutMs: 1_200_000,
    contentTypes: ['environment_travel', 'fast_draft', 'aerial_establishing'],
  },
  'cogvideox': {
    id: 'cogvideox', displayRole: 'OPEN-SOURCE',
    provider: 'fal', falEndpoint: 'fal-ai/cogvideox-5b',
    costPer5s: 6, maxDurationSec: 10, supportsI2V: false, supportsAudio: false,
    timeoutMs: 1_200_000,
    contentTypes: ['fast_draft', 'cgi_vfx', 'general'],
  },
  'hunyuan-video-1.5': {
    id: 'hunyuan-video-1.5', displayRole: 'CROWD',
    provider: 'fal', falEndpoint: 'fal-ai/hunyuan-video',
    costPer5s: 12, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 1_200_000,
    contentTypes: ['crowd_urban', 'cgi_character', 'environment_travel'],
  },
  'hunyuan-hy-motion': {
    id: 'hunyuan-hy-motion', displayRole: 'ANIMATOR',
    provider: 'fal', falEndpoint: 'fal-ai/hunyuan-video',
    costPer5s: 20, maxDurationSec: 15, supportsI2V: true, supportsAudio: false,
    timeoutMs: 1_200_000,
    contentTypes: ['cgi_character', 'physical_action'],
  },
  'pika-2.5': {
    id: 'pika-2.5', displayRole: 'COMMERCIAL',
    provider: 'fal', falEndpoint: 'fal-ai/pika-v2-turbo',
    costPer5s: 8, maxDurationSec: 10, supportsI2V: true, supportsAudio: false,
    timeoutMs: 600_000,
    contentTypes: ['product_commercial', 'fast_draft'],
  },
  'grok-imagine-video': {
    id: 'grok-imagine-video', displayRole: 'AUDIO-NATIVE',
    provider: 'xai',   // direct xAI API — NOT FAL
    costPer5s: 20, maxDurationSec: 15, supportsI2V: false, supportsAudio: true,
    timeoutMs: 600_000,
    contentTypes: ['audio_native', 'fast_draft', 'environment_travel'],
  },
}

// Total pool count — used for health checks + UI
export const MODEL_POOL_COUNT = Object.keys(MODEL_REGISTRY).length  // 21

// Returns models appropriate for a given content type, sorted by quality tier
export function getModelsForContentType(
  contentType: string,
  qualityTier: 'draft' | 'studio' | 'blockbuster'
): ModelSpec[] {
  const tier_cost: Record<string, number> = {
    draft: 10, studio: 25, blockbuster: 999,
  }
  const ceiling = tier_cost[qualityTier]
  return Object.values(MODEL_REGISTRY)
    .filter(m => m.contentTypes.includes(contentType) && m.costPer5s <= ceiling)
    .sort((a, b) => b.costPer5s - a.costPer5s)  // highest cost = best quality first
}
```

---

## STEP 3 — MODEL COUNCIL PICKER (Renderer — all 21 models, no model names)

The renderer's model council picker must show ALL 21 models as Forge Intelligence roles,
never revealing the underlying model names:

**Create** `src/renderer/components/generate/ModelCouncil.tsx`:

```tsx
// Model Council — 21 roles, zero model names in UI
// Uses IPC to get available roles (renderer never sees model IDs)

const COUNCIL_DISPLAY = [
  { role: 'APEX',        title: 'Visual Lead',        desc: 'Highest overall quality, 7-language sync' },
  { role: 'NARRATIVE',   title: 'Scene Architect',    desc: 'Long scenes, continuity, dialogue' },
  { role: 'CINEMA',      title: 'Cinema Engine',      desc: 'Photorealism, physics, native audio' },
  { role: 'MOTION',      title: 'Motion Expert',      desc: 'Camera movement, locomotion' },
  { role: 'PHYSICS',     title: 'Physics Engine',     desc: 'Fluid, gravity, realistic simulation' },
  { role: 'CONTROL',     title: 'Director Mode',      desc: 'Camera control, scene consistency' },
  { role: 'HDR',         title: 'HDR Specialist',     desc: 'Native 16-bit HDR, aerials' },
  { role: 'PREMIUM',     title: 'Premium Quality',    desc: 'Maximum fidelity, extreme consistency' },
  { role: 'ECONOMY',     title: 'Volume Engine',      desc: 'Environments, landscapes, budget shots' },
  { role: 'RAPID',       title: 'Speed Engine',       desc: '4K/50fps, fast generation' },
  { role: 'RAPID-FAST',  title: 'Draft Engine',       desc: 'Instant pre-vis, cheapest tier' },
  { role: 'EFFECTS',     title: 'Effects Specialist', desc: 'CGI, particles, stylized looks' },
  { role: 'HYBRID',      title: 'Portrait Engine',    desc: 'Still-to-video, portrait animation' },
  { role: 'DIALOGUE',    title: 'Dialogue Expert',    desc: 'Facial muscle tracking, close-ups' },
  { role: 'CROWD',       title: 'Crowd Director',     desc: 'Urban density, volumetric crowds' },
  { role: 'ANIMATOR',    title: '3D Animator',        desc: 'Walk cycles, dance, body mechanics' },
  { role: 'COMMERCIAL',  title: 'Commercial Pro',     desc: 'Product shots, brand content' },
  { role: 'AUDIO-NATIVE',title: 'Audio-Visual Engine',desc: 'Native synchronized audio output' },
  { role: 'LONGFORM',    title: 'Long-Form Director', desc: 'Continuous sequences 15s+' },
  { role: 'STYLIST',     title: 'Style Engine',       desc: 'Artistic, stylized, wide range' },
  { role: 'OPEN-SOURCE', title: 'Open Engine',        desc: 'Experimental, distinctive aesthetic' },
]
// 21 roles — render all in picker, never show model IDs
```

---

## STEP 4 — VERIFY IN ACCEPTANCE CRITERIA

**Add to Sprint 25 acceptance criteria:**

```
Acceptance (updated):
- Script decomposer assigns from pool of 21 models (not 12)
- Native audio scenes → AUDIO-NATIVE (Grok) regardless of tier
- Draft tier → RAPID-FAST or ECONOMY only, never PREMIUM/APEX/CINEMA
- Blockbuster tier → APEX / CINEMA / PHYSICS / PREMIUM eligible
- All 21 roles visible in Model Council picker (zero model names)
- Fallback chain confirmed: primary fails → fallback model assigned automatically
- No model marked as deprecated or removed from pool
```

---

## FEED ORDER FOR V3

```
16. CINEMA_V3_MASTER_ARCHITECTURE.md
17. CINEMA_V3_model_expansion_cursor_prompt.md  ← THIS DOCUMENT (feed before cursor prompt)
18. CINEMA_V3_CURSOR_PROMPT.md
19. CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md
20. CINEMA_V3_VFX_EFFECTS_ADDENDUM.md
21. CINEMA_V3_PLAYER_RENDERER_ADDENDUM.md
22. CINEMA_V3_API_REFERENCE_ADDENDUM.md
```
