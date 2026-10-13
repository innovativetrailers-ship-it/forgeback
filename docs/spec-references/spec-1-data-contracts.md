# SPEC PHASE 1 — DATA CONTRACTS & ADAPTER INTERFACES
## The foundation. Every other spec references these types. Nothing is "wired"
## until the thing on each side of a seam agrees on the contract here.
## Flagship = V3 desktop; V2 web = same contracts, web adapter, heavy caps omitted.

## HOW TO USE: this is the canonical type layer. Cursor implements these EXACTLY
## as written (names, optionality, enums). Every downstream spec (Phases 2-6)
## imports from here. A field renamed here is renamed everywhere.

═══════════════════════════════════════════════════════════════════════
# 1. CORE ENTITIES (persisted — SQLite on desktop, Postgres on web)
═══════════════════════════════════════════════════════════════════════

```typescript
// ─── Project ───────────────────────────────────────────────
interface Project {
  id: string                    // cuid
  title: string
  createdAt: number             // epoch ms
  updatedAt: number
  settings: ProjectSettings
}
interface ProjectSettings {
  aspectRatio: '16:9'|'9:16'|'1:1'|'2.39:1'|'4:5'
  fps: 24|30|60
  resolution: '720p'|'1080p'|'4k'
  qualityTier: 'draft'|'studio'|'blockbuster'
  colorSpace: 'rec709'|'p3'|'rec2020'
}

// ─── Scene ─────────────────────────────────────────────────
interface Scene {
  id: string
  projectId: string
  order: number
  brief: CreativeBrief          // minimal in v1, cognitive-enriched later
}

// ─── CreativeBrief (the Stage-1 output; cognitive stages fill it later) ──
interface CreativeBrief {
  rawPrompt: string
  enrichedPrompt: string        // v1: == rawPrompt or one-pass enrich; later: cognitive
  intent?: IntentModel          // Phase 3 fills; optional in v1
  emotionalArc?: EmotionalArc   // Phase 3
  styleKey: 'cinematic'|'documentary'|'commercial'|'animation'|'news'
  references: string[]          // implied film refs, optional
}

// ─── Shot (the central entity — most contracts touch this) ──
type ShotStatus = 'pending'|'awaiting_direction'|'generating'|'completed'|'failed'
type AnchorSource = 'auto'|'manual'|'keyframe'|'generated'|'none'

interface Shot {
  id: string
  sceneId: string
  projectId: string
  order: number
  prompt: string
  status: ShotStatus

  // ── MODEL SELECTION (write-owner: director UI. Pipeline NEVER writes.) ──
  selectedModelId: string       // canonical model id from the registry
  provider: Provider            // DERIVED from selectedModelId; asserted at submit
  modelOverride: boolean        // true = user chose; casting director must not overwrite

  // ── ANCHOR CHAIN ──
  anchorFrameUrl: string | null // start frame (prev end / manual / keyframe / generated)
  anchorSource: AnchorSource

  // ── LINKS ──
  characterIds: string[]        // Characters in this shot (identity persistence)
  locationId: string | null

  // ── RESULT (write-owner: worker/JobRunner ONLY) ──
  videoUrl: string | null       // ALWAYS your-origin (R2 mirror / MEDIA_DIR). Never raw CDN.
  sourceProviderUrl: string | null  // original provider url, for debug/reference
  lastFrame: string | null      // extracted end frame → next shot's anchor
  durationSec: number | null    // measured, never defaulted
  falRequestId: string | null   // idempotency key (runaway-loop fix)

  // ── QUALITY / CONTINUITY ──
  qualityScore: number | null   // Stage 5; null until scored
  continuityGroupId: string | null  // shots in same chain (sequential vs parallel cut)

  createdAt: number
  updatedAt: number
}

// ─── Character (identity persistence across shots) ──
interface Character {
  id: string
  projectId: string
  name: string                  // e.g. "MAYA"
  referenceImageUrl: string     // style-consistent anchor (Stage 0)
  seed: number | null           // generation seed for cross-shot consistency
  voiceId: string | null        // ElevenLabs voice id (unique per character)
  descriptor: string            // "28, sharp-eyed, determined"
  wardrobe: string | null       // working-memory continuity (red jacket stays)
}

// ─── Location (real-world plate) ──
interface Location {
  id: string
  projectId: string
  label: string                 // "Shibuya crossing"
  plateUrl: string              // Mapillary/reference image → reference_image_url
  coords: { lat: number, lng: number } | null
}

// ─── Clip (TIMELINE projection of a completed Shot) ──
type TrackKind = 'video'|'vfx'|'cgi'|'music'|'voice'|'sfx'|'title'
interface Clip {
  id: string                    // == shotId for generated clips
  shotId: string | null         // null for imported/effect clips
  track: TrackKind
  startSec: number
  durationSec: number
  sourceUrl: string             // == Shot.videoUrl. REQUIRED. never a thumbnail.
  posterUrl?: string
  label?: string
}

// ─── AudioAsset (Stage 7) ──
interface AudioAsset {
  id: string
  projectId: string
  kind: 'voice'|'music'|'sfx'
  characterId: string | null    // for voice stems
  url: string                   // your-origin
  durationSec: number
  startSec: number              // placement on the audio track
}
```

═══════════════════════════════════════════════════════════════════════
# 2. PROVIDER & MODEL CONTRACTS
═══════════════════════════════════════════════════════════════════════

```typescript
type Provider = 'fal'|'runway'|'grok'|'elevenlabs'|'suno'

interface ModelDef {
  id: string                    // canonical, kebab: 'veo-3.1'
  provider: Provider
  endpoint: string              // provider-specific: 'fal-ai/veo3.1' | 'gen4.5' | ...
  i2vEndpoint?: string
  role: string                  // 'APEX'|'MOTION'|'DIALOGUE'|'CONTROL'|'AUDIO-NATIVE'|'VFX'|'DRAFT'
  tier: 'draft'|'studio'|'blockbuster'
  costPer5s: number             // credits
  silentOnly: boolean           // force audio-off in payload
  // constraints come from schema-sync at runtime (not hardcoded):
  pinned: boolean               // reproducibility — don't auto-follow versions
}

// The v1 pool (Phase C of arch doc) — 7 models:
// veo-3.1(fal APEX), kling-3.0(fal MOTION), seedance-2.0(fal DIALOGUE),
// runway-gen4.5(runway CONTROL), grok-imagine(grok AUDIO-NATIVE),
// pixverse-c1(fal VFX), ltx-fast(fal DRAFT)

// ─── The ONE result shape every provider normalizes to ──
interface GenerationResult {
  videoUrl: string              // provider CDN url (pre-mirror)
  lastFrame?: string
  durationSec?: number
  provider: Provider
  requestId: string
}

// ─── Model constraints (from schema-sync, per endpoint) ──
interface ModelConstraints {
  endpoint: string
  required: string[]
  forbidden: string[]           // e.g. 'duration' on veo
  enums: Record<string, (string|number)[]>   // resolution:['480p',...], duration:[6,8,10]
  types: Record<string, 'string'|'number'|'boolean'>
  audioField: string | null     // the detected audio-toggle field to set off
  schemaHash: string
  fetchedAt: number
}
```

═══════════════════════════════════════════════════════════════════════
# 3. THE ADAPTER INTERFACE (the ONLY host-specific seam)
═══════════════════════════════════════════════════════════════════════

The spine calls THIS. Desktop and web each implement it. Spine code never
branches on host — no `if (isDesktop)` in pipeline logic, ever.

```typescript
interface HostAdapter {
  // ── Persistence (SQLite desktop / Postgres web) ──
  getProject(id: string): Promise<Project | null>
  saveShot(shot: Partial<Shot> & { id: string }): Promise<Shot>
  getShots(projectId: string): Promise<Shot[]>
  getCharacters(projectId: string): Promise<Character[]>
  // ... full CRUD per entity

  // ── Jobs (JobRunner desktop / BullMQ web) ──
  enqueue(job: { type: string, payload: unknown }): Promise<{ jobId: string }>
  onJobEvent(cb: (e: JobEvent) => void): void   // IPC desktop / SSE web

  // ── Media (MEDIA_DIR+forge-media:// desktop / R2+proxy web) ──
  persistMedia(srcUrl: string, key: string): Promise<string>  // returns your-origin url
  mediaPlaybackUrl(assetId: string): string     // forge-media:// | https R2
  saveFileDialog?(name: string, srcPath: string): Promise<void>  // desktop only

  // ── Secrets (keychain desktop / env web) ──
  getSecret(name: string): Promise<string | null>

  // ── Pause / billing gate (shared logic, host reads flag) ──
  isGenerationPaused(): Promise<boolean>
}

interface JobEvent {
  jobId: string
  type: 'progress'|'step'|'complete'|'failed'
  shotId?: string
  detail: {                     // 'complete' MUST carry these:
    videoUrl?: string
    lastFrame?: string
    durationSec?: number
  }
}
```

═══════════════════════════════════════════════════════════════════════
# 4. STATE OWNERSHIP TABLE (enforced — violating this = this session's bugs)
═══════════════════════════════════════════════════════════════════════

| State slice | WRITE owner | Readers | Bug if violated |
|---|---|---|---|
| Shot.status, videoUrl, lastFrame, falRequestId | worker/JobRunner ONLY | UI, reconcile | — |
| Shot.selectedModelId, modelOverride | director UI ONLY | dispatch (read-only) | model substitution |
| Shot.anchorFrameUrl | worker(advanceChain)+director UI(manual) | dispatch | broken chain |
| Clip[] | ONE timeline store | editor, Simple, player | empty timeline |
| Character.* | cast UI + Stage 0 | dispatch (as reference) | no character persistence |
| ModelConstraints | schema-sync only | buildPayload | 422s |
| GENERATION_PAUSED | ops/env | providerSubmit | runaway billing |

═══════════════════════════════════════════════════════════════════════
# 5. CURSOR PROMPT — PHASE 1 IMPLEMENTATION
═══════════════════════════════════════════════════════════════════════
```
Implement the canonical data layer for Cinematic Forge exactly as specified in
spec-1-data-contracts.md:
1. Create the TypeScript types for all entities (Project, Scene, Shot, Character,
   Location, Clip, AudioAsset) in a shared package importable by BOTH the desktop
   (Electron) and web (Next.js) codebases — e.g. packages/core/types.
2. Create ModelDef, GenerationResult, ModelConstraints, Provider types.
3. Define the HostAdapter interface. Create TWO implementations:
   - DesktopAdapter (better-sqlite3, JobRunner, MEDIA_DIR/forge-media://, keychain)
   - WebAdapter (Prisma/Postgres, BullMQ enqueue, R2/persistMedia, env secrets)
   Both implement the SAME interface. Spine code imports HostAdapter, never a
   concrete class.
4. Migrations: ensure Shot has selectedModelId, modelOverride, anchorFrameUrl,
   anchorSource, videoUrl, sourceProviderUrl, lastFrame, durationSec,
   falRequestId, qualityScore, continuityGroupId, characterIds, locationId.
   Character has referenceImageUrl, seed, voiceId, descriptor, wardrobe.
   Additive migrations only — never reset.
5. Enforce the state-ownership table: selectedModelId setter is exposed ONLY to
   the director UI layer; the worker/dispatch layer has read-only access. Make
   this a types/access boundary, not just a convention.
DO NOT implement pipeline logic yet — types, adapters, migrations only. Confirm
tsc passes on both hosts.
```

## NEXT
Phase 1 (this doc) = the data contracts everything references.
Say "next" to build PHASE 2 — Pipeline Stage Specs (each of the 7 stages fully
specified: exact I/O, the FAL/Runway/Grok dispatch contracts, buildPayload,
mirror, error paths, with Cursor prompts).
