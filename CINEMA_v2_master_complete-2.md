# CINEMATIC FORGE — V2 MASTER COMPLETE SPEC
## The Only Document That Defines "Done"
### 121 Features Total: 106 V1 + 15 V2 | Every Acceptance Criterion Defined

---

## CRITICAL PROBLEM THIS DOCUMENT SOLVES

The previous V2 documents (`CINEMA_v2_features.md` + `CINEMA_v2_completion_checklist.md`) covered only the **15 new V2 features**.

They **completely ignored** the **38 remaining V1 features** still marked ⚠️ or ❌ in the master roadmap.

**V2 = 106 V1 features (all complete) + 15 new V2 features = 121 features total.**

This document is the single source of truth. Nothing ships until all 121 rows are ✅.

---

## MASTER STATUS TABLE: ALL 121 FEATURES

### LEGEND
- ✅ = Complete (as of last codebase audit)
- ⚠️ = Partial — specific items listed
- ❌ = Missing entirely
- 🆕 = New V2 feature

---

### GROUP A — TIMELINE EDITING (13 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| A01 | Multi-track timeline | Advanced+ | ✅ | — |
| A02 | Drag-and-drop clips | Advanced+ | ✅ | — |
| A03 | Trim handles | Advanced+ | ✅ | — |
| A04 | Ripple edit | Advanced+ | ✅ | — |
| A05 | Repaint (highlight + re-generate) | Advanced+ | ✅ | — |
| A06 | **Optical flow retiming / slow-mo** | Advanced+ | ❌ | `src/lib/timeline/OpticalFlow.ts` + fal-ai/film-interpolation + UI slider |
| A07 | **Video stabilisation** | Advanced+ | ❌ | FFmpeg `vidstab` filter + `src/lib/timeline/Stabiliser.ts` + per-clip toggle |
| A08 | **Morph Cut (dialogue takes)** | Advanced+ | ❌ | fal.ai FILM model + `src/lib/timeline/MorphCut.ts` + detect dialogue boundary |
| A09 | **Transcript-based editing** | Advanced+ | ❌ | `src/components/editor/TranscriptEditor.tsx` + Whisper via fal.ai + word-level timestamps |
| A10 | **AI filler word removal** | Advanced+ | ❌ | `src/lib/audio/FillerRemover.ts` + Whisper + FFmpeg silence splice |
| A11 | Silence removal | Advanced+ | ❌ | FFmpeg `silencedetect` filter + BullMQ job + `src/lib/audio/SilenceRemover.ts` |
| A12 | Auto Reframe | Advanced+ | ❌ | YOLO object detection + FFmpeg crop filter + `src/lib/timeline/AutoReframe.ts` |
| A13 | Clip Extend (generative) | Advanced+ | ❌ | I2V models via MediaRouter + `src/lib/timeline/ClipExtend.ts` + UI button on clip |

---

### GROUP B — COLOUR SCIENCE (12 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| B01 | **ASC CDL wheels (Lift/Gamma/Gain)** | Ultimate | ❌ | 3-wheel canvas control + FFmpeg `colorlevels` + `src/lib/color/CDLWheels.ts` |
| B02 | **LUT import (.cube)** | Ultimate | ❌ | File drop zone + FFmpeg `lut3d` filter + `src/lib/color/LUTLoader.ts` |
| B03 | **Film emulation presets** | Ultimate | ❌ | 20+ `.cube` files in `/public/luts/` + preset picker UI |
| B04 | **HDR / Rec.2020 support** | Ultimate | ❌ | FFmpeg `-colorspace bt2020` + tone mapping + HDR preview canvas |
| B05 | **Waveform + Vectorscope** | Ultimate | ❌ | Canvas real-time renderer + pixel sample from video frame + `src/components/editor/Scopes.tsx` |
| B06 | **OpenColorIO (ACES 2.0)** | Ultimate | ❌ | OCIO config bundle in `/config/ocio/` + FFmpeg `ociofiletransform` + transform selector |
| B07 | **RAW camera ingestion** | Ultimate | ❌ | `src/lib/storage/raw-ingest.ts` + libraw via child_process + BRAW/R3D/ARRI support |
| B08 | Timeline harmonisation | Advanced+ | ✅ | — |
| B09 | IC-Light relighting | Advanced+ | ✅ | — |
| B10 | Location plate lighting match | Advanced+ | ✅ | — |
| B11 | Film grain preservation | Advanced+ | ✅ | — |
| B12 | **Collaborative grade session** | Ultimate | ❌ | socket.io colour state sync + `src/lib/collab/GradeSync.ts` + lock per-clip grading |

---

### GROUP C — GENERATION (8 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| C01 | Text-to-video | Simple+ | ✅ | — |
| C02 | Image-to-video | Simple+ | ✅ | — |
| C03 | Audio-to-video | Simple+ | ✅ | — |
| C04 | Multi-segment omnichannel clip | Advanced+ | ✅ | — |
| C05 | Auto-Social (Drop & Direct) | Simple+ | ⚠️ | `AutoSocialDrop` component missing. `TierSelector` missing. `GenerationProgress` missing |
| C06 | AI Director full film assembly | Ultimate | ✅ | — |
| C07 | **Storyboard from script** | Ultimate | ❌ | `src/app/api/storyboard/route.ts` + Fountain parse → scene list → Claude Sonnet → Flux Pro image per scene |
| C08 | Reference video analysis | Advanced+ | ✅ | — |

---

### GROUP D — VFX & COMPOSITING (15 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| D01 | Layer-based compositor | Advanced+ | ✅ | — |
| D02 | Node-based compositor (Fusion-class) | Ultimate | ✅ | — |
| D03 | Chroma key / Green screen | Advanced+ | ✅ | — |
| D04 | AI matting (no green screen) | Advanced+ | ✅ | — |
| D05 | Depth matting | Advanced+ | ✅ | — |
| D06 | **Planar / surface tracker** | Advanced+ | ❌ | `src/lib/vfx/PlanarTracker.ts` + fal-ai/cotracker + corner-pin warp + UI overlay |
| D07 | **Motion Brush** | Advanced+ | ❌ | `src/components/editor/MotionBrush.tsx` + ControlNet + Kling motion API + canvas brush |
| D08 | **GPU particle system** | Ultimate | ❌ | Three.js `InstancedMesh` + `src/components/vfx/ParticleSystem.tsx` + force controls |
| D09 | **SFX asset library** | Advanced+ | ❌ | Pre-rendered assets uploaded to R2 + Prisma `SFXAsset` model + browse panel |
| D10 | AI-generated custom VFX | Advanced+ | ✅ | — |
| D11 | CGI insertion (text-to-3D composite) | Ultimate | ✅ | — |
| D12 | Luminance / luma keyer | Advanced+ | ❌ | FFmpeg `chromakey` on luminance + `src/lib/vfx/LumaKeyer.ts` + threshold slider |
| D13 | Mask tools (bezier, freehand) | Advanced+ | ❌ | SVG bezier editor on canvas + `src/components/editor/MaskTool.tsx` + export mask to FFmpeg |
| D14 | Blend mode library | Advanced+ | ❌ | FFmpeg overlay filter presets + 16 blend modes + dropdown in layer panel |
| D15 | Spatial computing export | Ultimate | ⚠️ | Depth maps done. Missing: `.mvhevc` MV-HEVC encoder + `src/lib/spatial/SpatialExport.ts` + Vision Pro metadata |

---

### GROUP E — 3D / MOTION GRAPHICS (10 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| E01 | **Text prompt → 3D asset** | Ultimate | ❌ | `src/app/api/cgi/route.ts` (exists) + fal-ai/triposg wire-up + Depth Anything composite |
| E02 | Depth-aware compositing | Ultimate | ✅ | — |
| E03 | Scene lighting estimation | Ultimate | ✅ | — |
| E04 | Perspective-matched insertion | Ultimate | ✅ | — |
| E05 | **Motion graphics templates (200+)** | Advanced+ | ❌ | 200 Remotion compositions in `/src/remotion/templates/` + browse panel + drag-to-timeline |
| E06 | **AI-generated MoGRT on demand** | Advanced+ | ❌ | `src/app/api/mogrt/route.ts` + Model 1 → generate Remotion JSON → render |
| E07 | Text overlay (3D extruded) | Advanced+ | ✅ | — |
| E08 | Particle behaviours (gravity, wind) | Ultimate | ❌ | Three.js physics forces in particle system (depends on D08) |
| E09 | Diffusion physics for VFX | Ultimate | ❌ | VLM + physics model via fal.ai + `src/lib/vfx/DiffusionPhysics.ts` |
| E10 | USD scene export | Ultimate | ❌ | Three.js → USD exporter + `src/app/api/export/usd/route.ts` |

---

### GROUP F — AUDIO DAW (16 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| F01 | Multi-track audio mixer | Advanced+ | ✅ | — |
| F02 | Per-track volume + pan | Advanced+ | ✅ | — |
| F03 | **6-band parametric EQ** | Ultimate | ❌ | FFmpeg `equalizer` filter per band + `src/components/audio/ParametricEQ.tsx` + canvas graph |
| F04 | **Compressor / Gate / Limiter** | Ultimate | ❌ | FFmpeg `acompressor` + `src/components/audio/DynamicsPanel.tsx` + threshold/ratio/knee sliders |
| F05 | **Reverb + Delay inserts** | Ultimate | ❌ | FFmpeg `areverb` + `aecho` + `src/components/audio/InsertPanel.tsx` |
| F06 | **De-esser** | Ultimate | ❌ | FFmpeg dynamic EQ on sibilance band + `src/lib/audio/DeEsser.ts` |
| F07 | **Dolby Atmos spatial audio** | Ultimate | ❌ | FFmpeg spatial metadata + Atmos bed/object export + `src/lib/audio/AtmosMixer.ts` |
| F08 | **AI IntelliCut (silence removal)** | Advanced+ | ❌ | Whisper timestamps + FFmpeg splice + `src/lib/audio/IntelliCut.ts` + preview before apply |
| F09 | **Speaker separation** | Advanced+ | ❌ | fal.ai audio separation model + `src/lib/audio/SpeakerSeparator.ts` + separate stems |
| F10 | **AI Dialogue Matcher** | Ultimate | ❌ | EQ profile matching across takes + `src/lib/audio/DialogueMatcher.ts` |
| F11 | **ADR loop recorder** | Ultimate | ❌ | Web Audio API recorder + loop playback sync + `src/components/audio/ADRRecorder.tsx` |
| F12 | **Foley recorder** | Ultimate | ❌ | Web Audio API + frame sync markers + `src/components/audio/FoleyRecorder.tsx` |
| F13 | **Stem export buses** | Ultimate | ❌ | FFmpeg multi-output mixdown + `src/app/api/export/stems/route.ts` + dialogue/music/sfx buses |
| F14 | Music generation (Suno) | Simple+ | ✅ | — |
| F15 | Voice synthesis + cloning (ElevenLabs) | Advanced+ | ✅ | — |
| F16 | Foley / ambient sound (AudioCraft) | Advanced+ | ✅ | — |

---

### GROUP G — CHARACTER SYSTEM (6 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| G01 | Character vault (multi-image register) | Advanced+ | ✅ | — |
| G02 | LoRA auto-training (10-scene trigger) | Advanced+ | ✅ | — |
| G03 | Model lock (character consistency) | Advanced+ | ✅ | — |
| G04 | SFX makeup system | Advanced+ | ✅ | — |
| G05 | Character recasting | Advanced+ | ✅ | — |
| G06 | Act-Two performance capture | Advanced+ | ✅ | — |

---

### GROUP H — SOCIAL & DISTRIBUTION (5 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| H01 | Auto-Social 30-asset editor | Simple+ | ⚠️ | Backend complete. Missing: `AutoSocialDrop` UI component wired to store |
| H02 | **Smart highlight extraction** | Simple+ | ❌ | `src/app/api/highlights/route.ts` + Whisper transcript scoring + Model 1 moment detection |
| H03 | **Direct social publishing** | Simple+ | ❌ | TikTok Creator API + Instagram Graph API + YouTube Data API v3 + `src/lib/social/Publisher.ts` |
| H04 | **Platform auto-reframe** | Simple+ | ❌ | YOLO tracking + FFmpeg crop + aspect ratio presets (9:16, 1:1, 4:5) + preview |
| H05 | **Brand kit auto-apply** | Advanced+ | ❌ | `BrandKit` Prisma model + logo overlay + font stack + colour palette + `src/lib/brand/BrandKitApply.ts` |

---

### GROUP I — LOCATION ENGINE (5 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| I01 | Mapillary real-world location search | Advanced+ | ✅ | — |
| I02 | Cesium aerial path builder | Advanced+ | ✅ | — |
| I03 | OSM generative prompt builder | Advanced+ | ✅ | — |
| I04 | Location plate lighting extraction | Advanced+ | ✅ | — |
| I05 | Production Scout mode | Ultimate | ✅ | — |

---

### GROUP J — FILM PRODUCTION (5 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| J01 | AI Director (script → full film) | Ultimate | ✅ | — |
| J02 | Continuity checker | Ultimate | ✅ | — |
| J03 | **Multi-camera editor** | Ultimate | ❌ | Timecode sync (SMPTE) + YOLO actor detection per-camera + multicam monitor view + `src/components/editor/MultiCam.tsx` |
| J04 | Series bible generator | Ultimate | ✅ | — |
| J05 | Film mode (feature film pipeline) | Ultimate | ✅ | — |

---

### GROUP K — EXPORT & DELIVERY (6 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| K01 | Social export (MP4 H.264, platform presets) | Simple+ | ✅ | — |
| K02 | Professional export (ProRes 422/4444) | Advanced+ | ✅ | — |
| K03 | **DCP (Digital Cinema Package)** | Ultimate | ❌ | Python DCP microservice (port 7433) + MXF + subtitle track + `src/app/api/export/dcp/route.ts` |
| K04 | **IMF package for streaming platforms** | Ultimate | ❌ | Python IMF microservice (port 7433) + Netflix/Amazon validation + `src/app/api/export/imf/route.ts` |
| K05 | **C2PA provenance metadata injection** | All | ❌ | FFmpeg `-metadata` injection + C2PA manifest + `src/lib/export/C2PAInject.ts` |
| K06 | **OCIO-correct export** | Ultimate | ❌ | OpenColorIO pipeline + `src/lib/export/OCIOExport.ts` + ACES output transform |

---

### GROUP L — EXTENSIBILITY (1 feature)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| L01 | **Node.js REST plugin API + npm SDK** | Ultimate | ❌ | REST API endpoints + API key auth + rate limiting + npm SDK package publish + docs |

---

### GROUP M — UPSCALING (6 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| M01 | Per-clip upscale (2x/4x/8x) | Advanced+ | ✅ | — |
| M02 | Export-time upscale | All | ✅ | — |
| M03 | Batch project upscale | Advanced+ | ✅ | — |
| M04 | Vault auto-upscale (char references) | Advanced+ | ✅ | — |
| M05 | Face enhancement (CodeFormer) | Advanced+ | ✅ | — |
| M06 | Film grain preservation | Advanced+ | ✅ | — |

---

### GROUP N — AVATAR SYSTEM (4 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| N01 | **Instant avatar (webcam)** | Simple+ | ⚠️ | Lib exists. Missing: `src/app/api/avatar/create/route.ts` + `src/components/panels/AvatarCreator.tsx` |
| N02 | **Stock avatar library (30+)** | Simple+ | ⚠️ | Lib exists. Missing: `src/app/api/avatar/list/route.ts` + `src/components/panels/AvatarGallery.tsx` |
| N03 | **Script-to-avatar-video** | Simple+ | ⚠️ | Lib exists. Missing: `src/app/api/avatar/generate/route.ts` + `src/components/panels/TalkingPhotoPanel.tsx` |
| N04 | **Talking photo** | Simple+ | ⚠️ | Depends on fal-ai/sadtalker + same routes as N01–N03 |

---

### GROUP O — WORKFLOW & COLLABORATION (6 features)

| ID | Feature | Mode | Status | Remaining Work |
|---|---|---|---|---|
| O01 | **Client review portal** | Advanced+ | ⚠️ | Schema exists. Missing: `GET /api/review/[token]/comments` + `POST /api/review/[token]/approve` |
| O02 | Frame-accurate annotations | Advanced+ | ✅ | — |
| O03 | Approval workflow | Advanced+ | ⚠️ | Route missing (same as O01) |
| O04 | **Video translation (29 languages)** | Advanced+ | ❌ | Whisper → translated script → ElevenLabs dub → SadTalker lip-sync + `src/app/api/translate/video/route.ts` |
| O05 | **Overdub (word-level voice patch)** | Advanced+ | ❌ | ElevenLabs + Whisper timestamps + frame-accurate splice + `src/lib/audio/Overdub.ts` |
| O06 | **Stock asset library (Pexels+FMA)** | All | ❌ | Pexels API integration + FMA music + `src/app/api/stock/route.ts` + search panel UI |

---

### GROUP P — INFRASTRUCTURE (not in 106 count but required to ship)

| Item | Status | Remaining Work |
|---|---|---|
| Knowledge firewall vocabulary.ts | ⚠️ | `src/lib/firewall/vocabulary.ts` — strips VLM names from all marketing outputs |
| Routing layer rename (swarm→routing) | ❌ | `src/lib/swarm/` → `src/lib/routing/`, `src/lib/models/` → `src/lib/engines/`, update all imports |
| Signup 3-step flow | ❌ | `/signup` route + `PlanSelector` + `PaymentOptions` components |
| TokenBar | ❌ | `src/components/layout/TokenBar.tsx` — always-visible credit balance bar |
| Stripe Customer Balance flow | ⚠️ | `POST /api/payments/deposit` + webhook — funds held in Stripe, vendors paid from it (todays_fixes Fix 12) |
| Credit pack + subscription routes | ⚠️ | `/api/payments/credit-pack` + `/subscribe` + `/portal` (stripe_setup) |
| Simple mode UI components | ✅ | `TierSelector`, `GenerationProgress` (todays_fixes) + `SlidesToVideoPanel` (`CINEMA_ui_workers_completion.md` §2.3) |
| Store type completeness | ✅ | 29 enum values added — `CINEMA_ui_workers_completion.md` §1 |
| Transcript + MultiCam panels | ✅ | `CINEMA_ui_workers_completion.md` §2.1, §2.2 |
| Camera sliders + Lighting + Effects + ContextMenu + shortcuts | ✅ | `CINEMA_ui_workers_completion.md` §3 |
| Landing page component decomposition | ⚠️ | Break inline into: `HeroSection`, `FeatureSection`, `PricingSection`, `Footer` |
| Workers (training-pipeline.ts) | ✅ | Specced in `CINEMA_ui_workers_completion.md` §4.1 |
| Workers (distillation.ts) | ✅ | Specced in `CINEMA_ui_workers_completion.md` §4.2 |
| Workers (quality-gate.ts) | ✅ | Specced in `CINEMA_ui_workers_completion.md` §4.3 |
| Brain model2.ts | ❌ | `src/lib/brain/model2.ts` — Mochi inference interface |
| Brain orchestrator.ts | ❌ | `src/lib/brain/orchestrator.ts` |
| Dev account seed | ❌ | `prisma/seed.ts` — `innovative.trailers@gmail.com`, ADMIN, 9999999 credits |
| ENV vars (~40% missing) | ⚠️ | FAL_API_KEY, 4-domain DBs/Redis, location APIs, Model1/2 endpoints, Suno, xAI, training cluster (PayPal REMOVED) |

---

### GROUP Q — V2 NEW FEATURES (15 new features) 🆕

| ID | Feature | Status | Remaining Work |
|---|---|---|---|
| V2-01 | 🆕 **Emotion Lattice** (Industry First) | ❌ | Full spec in `CINEMA_v2_features.md` + completion criteria in `CINEMA_v2_completion_checklist.md` |
| V2-02 | 🆕 **Effect-Aware Object Removal** (Industry First) | ❌ | Full spec + checklist — EffectErase via fal.ai |
| V2-03 | 🆕 **Wireless Camera → Timeline** (Industry First) | ❌ | Full spec + checklist — WebRTC + FFmpeg + WebSocket |
| V2-04 | 🆕 **Rough Cut Copilot** | ❌ | `CINEMA_v2_features.md` §2.1 + checklist §6 |
| V2-05 | 🆕 **Real-Time Multiplayer Editing** | ❌ | `CINEMA_v2_features.md` §2.2 + checklist §4–5 |
| V2-06 | 🆕 **AI Colour Grading Suggestions** | ❌ | `CINEMA_v2_features.md` §2.3 + checklist §7 |
| V2-07 | 🆕 **Native Spatial Video Editing** | ⚠️ | D15 partial + `CINEMA_v2_features.md` §2.4 + checklist §8 |
| V2-08 | 🆕 **Shoppable Export Builder** | ❌ | `CINEMA_v2_features.md` §2.5 + checklist §9 |
| V2-09 | 🆕 **Shopify Integration** | ❌ | checklist §10 |
| V2-10 | 🆕 **WooCommerce Integration** | ❌ | checklist §10 |
| V2-11 | 🆕 **Unreal Engine Bridge** | ❌ | `CINEMA_v2_features.md` §3 + checklist §11 |
| V2-12 | 🆕 **Project Importer (Premiere/DaVinci/CapCut)** | ❌ | `CINEMA_project_importer.md` |
| V2-13 | 🆕 **C2PA AI Content Watermarking** | ❌ | K05 + enhanced provenance |
| V2-14 | 🆕 **Multi-user Review with Timestamps** | ❌ | Extends O01–O03 with real-time collab |
| V2-15 | 🆕 **Interactive Branching Video Export** | ❌ | Shoppable player extended for narrative branching |

---

## COMPLETION SUMMARY

| Category | Total | ✅ Done | ⚠️ Partial | ❌ Missing |
|---|---|---|---|---|
| Group A — Timeline | 13 | 5 | 0 | 8 |
| Group B — Colour | 12 | 4 | 0 | 8 |
| Group C — Generation | 8 | 6 | 1 | 1 |
| Group D — VFX | 15 | 7 | 1 | 7 |
| Group E — 3D/MoGRT | 10 | 4 | 0 | 6 |
| Group F — Audio DAW | 16 | 3 | 0 | 13 |
| Group G — Characters | 6 | 6 | 0 | 0 |
| Group H — Social | 5 | 0 | 1 | 4 |
| Group I — Location | 5 | 5 | 0 | 0 |
| Group J — Film Prod | 5 | 4 | 0 | 1 |
| Group K — Export | 6 | 2 | 0 | 4 |
| Group L — Plugin | 1 | 0 | 0 | 1 |
| Group M — Upscaling | 6 | 6 | 0 | 0 |
| Group N — Avatar | 4 | 0 | 4 | 0 |
| Group O — Workflow | 6 | 1 | 2 | 3 |
| **V1 Subtotal** | **106** | **53** | **9** | **44** |
| Group P — Infrastructure | 15 | 0 | 7 | 8 |
| Group Q — V2 New | 15 | 0 | 1 | 14 |
| **GRAND TOTAL** | **136** | **53** | **17** | **66** |

> **Note:** Previous audit showed 68/106 — slight variance due to ahead-of-spec items being counted differently. This table is the authoritative count.

---

## ACCEPTANCE CRITERIA FOR ALL REMAINING ITEMS

### A06 — Optical Flow Retiming / Slow-Motion

**Files required:**
- `src/lib/timeline/OpticalFlow.ts`
- `src/app/api/timeline/retime/route.ts`
- Retime control added to `ClipProperties.tsx` right panel

**Acceptance:**
- [ ] Clip right-click → "Retime..." → speed selector (25%, 50%, 200%, 400%, custom)
- [ ] fal-ai/film-interpolation called for smooth interpolation
- [ ] FFmpeg PTS adjustment applied after interpolation
- [ ] New clip replaces original on timeline at same position
- [ ] 10-second clip retimed to 50% = 20 seconds, plays smoothly (no duplicated frames)
- [ ] Credit cost shown before applying: 20cr per 5 seconds of output

---

### A07 — Video Stabilisation

**Files required:**
- `src/lib/timeline/Stabiliser.ts`
- `src/app/api/timeline/stabilise/route.ts`

**Acceptance:**
- [ ] Clip right-click → "Stabilise" → strength selector (Mild/Medium/Strong)
- [ ] FFmpeg `vidstabdetect` + `vidstabtransform` filters applied
- [ ] Original kept as fallback; stabilised version replaces on confirm
- [ ] Preview: show stabilised version in player before committing
- [ ] Shaky test footage: after stabilisation, horizon stays horizontal

---

### A08 — Morph Cut

**Files required:**
- `src/lib/timeline/MorphCut.ts`
- `src/app/api/timeline/morphcut/route.ts`

**Acceptance:**
- [ ] Select 2 adjacent dialogue clips → right-click → "Apply Morph Cut"
- [ ] fal.ai FILM model called to generate 15-frame crossfade sequence
- [ ] Transition appears between clips, jump cut hidden
- [ ] Undo removes morph cut, restores original cut

---

### A09 — Transcript-Based Editing

**Files required:**
- `src/components/editor/TranscriptEditor.tsx`
- `src/app/api/transcript/route.ts`
- `src/lib/audio/TranscriptSync.ts`

**Acceptance:**
- [ ] Transcript panel: shows word-by-word transcript linked to video timestamp
- [ ] Delete a word in transcript → that word's audio + video removed
- [ ] Delete a sentence → that sentence's range removed from timeline
- [ ] Re-order sentences → clips re-ordered on timeline
- [ ] Speaker labels ("Speaker 1:", "Speaker 2:") shown and filterable
- [ ] Search transcript by keyword → jump to that moment
- [ ] Export transcript as `.srt`, `.vtt`, `.txt`

---

### A10 — AI Filler Word Removal

**Files required:**
- `src/lib/audio/FillerRemover.ts`
- `src/app/api/audio/remove-fillers/route.ts`

**Acceptance:**
- [ ] Per-clip action: "Remove Filler Words"
- [ ] Whisper identifies: "um", "uh", "like", "you know", "so", "basically", pauses >0.8s
- [ ] Preview list: shows all found fillers with timestamps, user can uncheck to keep
- [ ] FFmpeg splices out selected items, re-joins audio smoothly
- [ ] No audible click or pop at splice points

---

### A11 — Silence Removal

**Files required:**
- `src/lib/audio/SilenceRemover.ts`
- `src/app/api/audio/remove-silence/route.ts`

**Acceptance:**
- [ ] Per-clip action: "Remove Silence" with threshold dB slider (-40dB default)
- [ ] FFmpeg `silencedetect` identifies silent regions
- [ ] Preview shows regions to be removed highlighted
- [ ] BullMQ job processes and returns new clip URL
- [ ] Minimum silence duration configurable (0.5s default, protects intentional pauses)

---

### A12 — Auto Reframe

**Files required:**
- `src/lib/timeline/AutoReframe.ts`
- `src/app/api/timeline/reframe/route.ts`

**Acceptance:**
- [ ] Export dialog: "Platform Reframe" — select target: TikTok 9:16, Instagram Square, YouTube 16:9
- [ ] YOLO detects primary subject per frame
- [ ] FFmpeg smart crop follows subject (smooth tracking, no jerky movement)
- [ ] Preview: side-by-side comparison original vs reframed before export
- [ ] Works for entire project export (all clips reframed consistently)

---

### A13 — Clip Extend (Generative)

**Files required:**
- `src/lib/timeline/ClipExtend.ts`
- `src/app/api/timeline/extend/route.ts`

**Acceptance:**
- [ ] Clip hover: "Extend →" button appears at right edge of clip
- [ ] Drag to extend beyond clip boundary triggers generative extension
- [ ] Last frame of clip sent to I2V model (matching engine from MediaRouter)
- [ ] Generated continuation seamlessly blends with original
- [ ] Duration extended by specified amount (2s, 4s, 8s)
- [ ] Credit cost shown: same as new generation at matching quality tier

---

### B01-B07 — Colour Science Suite

**B01 (ASC CDL Wheels):**
- [ ] Three canvas wheels: Lift (shadows), Gamma (mids), Gain (highlights)
- [ ] Each wheel has R/G/B colour draggable + luminance centre
- [ ] Real-time preview as user drags
- [ ] `FFmpeg colorlevels` filter generated from wheel values
- [ ] Reset individual wheels; master reset button

**B02 (LUT Import):**
- [ ] Drag-and-drop `.cube` file onto LUT slot
- [ ] FFmpeg `lut3d` filter applied with configurable intensity (0–100%)
- [ ] LUT library: saved per-user, name + preview thumbnail
- [ ] Export LUT as `.cube` from current grade

**B03 (Film Emulation Presets):**
- [ ] 20+ presets: Kodak Vision3 500T, Kodachrome 25, FUJI Velvia 50, etc.
- [ ] Thumbnails showing before/after on reference frame
- [ ] One-click apply, intensity slider
- [ ] LUT files stored in `/public/luts/film/` (included in repo)

**B04 (HDR/Rec.2020):**
- [ ] Project settings: Colour Space selector (SDR/HDR10/HLG)
- [ ] HDR clips import with correct metadata preserved
- [ ] FFmpeg tone-map for SDR preview (HLG/PQ to SDR)
- [ ] Export as HDR with correct colour metadata

**B05 (Waveform + Vectorscope):**
- [ ] Scopes panel in Ultimate mode
- [ ] Waveform: luminance parade (RGB or luma) updates as playhead moves
- [ ] Vectorscope: chrominance plot, skin tone line visible
- [ ] Canvas updates at 24fps during playback

**B06 (OpenColorIO ACES 2.0):**
- [ ] OCIO config file shipped with app at `/config/ocio/aces_2.0/`
- [ ] Input transform selector (sRGB, Log3G10, ARRI LogC3, etc.)
- [ ] Output transform selector (Rec.709, Rec.2020, P3-DCI)
- [ ] FFmpeg `ociofiletransform` applied correctly

**B07 (RAW Camera Ingestion):**
- [ ] `src/lib/storage/raw-ingest.ts` converts BRAW, R3D, ARRI ARI, Sony RAW, Canon CRM
- [ ] FFmpeg + libraw child_process pipeline
- [ ] Output: normalised ProRes 4444 proxy + full-res archival copy
- [ ] OCIO transform applied based on camera native profile

---

### B12 — Collaborative Grade Session

**Files required:**
- `src/lib/collab/GradeSync.ts`

**Acceptance:**
- [ ] Multiple users in Ultimate mode see live grade changes from other users
- [ ] Grade changes broadcast via socket.io to all connected editors
- [ ] Lock: "Claim grade" prevents another user from overriding live
- [ ] Grade undo propagates to all users (or per-user undo with explicit push)

---

### C07 — Storyboard from Script

**Files required:**
- `src/app/api/storyboard/route.ts`

**Acceptance:**
- [ ] Paste Fountain format screenplay in dialog
- [ ] Claude Sonnet parses: scene headings → visual descriptions
- [ ] Flux Pro generates image per scene
- [ ] Storyboard grid shown: scene heading + image + dialogue
- [ ] Export as PDF storyboard
- [ ] "Generate from storyboard" → sends each scene to video generation queue

---

### D06 — Planar / Surface Tracker

**Files required:**
- `src/lib/vfx/PlanarTracker.ts`
- `src/app/api/vfx/track/route.ts`
- `src/components/editor/PlanarTrackOverlay.tsx`

**Acceptance:**
- [ ] User draws quad over surface in first frame (4 corner handles)
- [ ] fal-ai/cotracker tracks surface through clip
- [ ] Tracked corner data stored as keyframe array
- [ ] Replacement texture/image warped to match tracked surface each frame
- [ ] FFmpeg `perspective` filter applied per-frame
- [ ] Use cases work: sign replacement, screen replacement, text on moving surface

---

### D07 — Motion Brush

**Files required:**
- `src/components/editor/MotionBrush.tsx`
- `src/app/api/vfx/motion-brush/route.ts`

**Acceptance:**
- [ ] Toggle "Motion Brush" mode in editor toolbar
- [ ] User paints region on clip frame preview
- [ ] Stroke direction indicates motion vector direction
- [ ] ControlNet or Kling motion API called with masked region + motion vector
- [ ] Only painted region receives motion; rest of clip unaffected
- [ ] Multiple strokes: different regions can have different motion directions

---

### D08 + E08 — GPU Particle System

**Files required:**
- `src/components/vfx/ParticleSystem.tsx`
- `src/lib/vfx/ParticleEngine.ts`

**Acceptance:**
- [ ] Add "Particles" layer in Ultimate compositor
- [ ] Controls: emitter type (point/line/sphere), particle count, life span, size, opacity
- [ ] Physics forces: gravity (direction + strength), wind, turbulence
- [ ] Particle textures: fire, smoke, sparks, snow, rain, dust (library of 12+)
- [ ] Three.js `InstancedMesh` renders at 60fps in editor preview
- [ ] Export: particles baked into video via WebGL → ffmpeg frame sequence

---

### D09 — SFX Asset Library

**Files required:**
- `src/app/api/sfx/assets/route.ts`
- `src/components/panels/SFXLibraryPanel.tsx`
- Prisma model: `SFXAsset`

**Acceptance:**
- [ ] 50+ pre-rendered VFX assets on R2: fire, smoke, explosions, magic, weather, sci-fi
- [ ] Browse panel: filter by category, search by name
- [ ] Drag asset to timeline → appears as overlay layer on clip
- [ ] Blend mode selector per asset (screen, add, overlay)
- [ ] Loop/once/ping-pong playback options
- [ ] Asset previews (thumbnail + 2s preview on hover)

---

### D12 — Luminance / Luma Keyer

**Acceptance:**
- [ ] In compositor: "Luma Key" layer option
- [ ] Threshold slider: pixels brighter than threshold → transparent
- [ ] Inverse luma key (dark = transparent)
- [ ] Feather slider for edge softness
- [ ] Works as alternative to chroma key for light-based compositing

---

### D13 — Mask Tools (Bezier + Freehand)

**Acceptance:**
- [ ] Bezier pen tool: click to place control points, drag for curves
- [ ] Freehand tool: draw with mouse/touch
- [ ] Mask can be inverted
- [ ] Mask exported as SVG path → FFmpeg `mask` filter
- [ ] Keyframe mask over time (mask morphs between keyframes)
- [ ] Works in compositor as isolation mask for any layer

---

### D14 — Blend Mode Library

**Acceptance:**
- [ ] Dropdown on every compositor layer: Normal, Add, Screen, Overlay, Multiply, Dodge, Burn, Soft Light, Hard Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity, Darken, Lighten (16+ modes)
- [ ] FFmpeg overlay filter map for each mode
- [ ] Opacity slider (0–100%) per layer
- [ ] Real-time preview updates within 500ms of mode change

---

### D15 — Spatial Computing Export (complete)

**Completion of partial work:**
- [ ] `.mvhevc` encoder: call Apple Compressor CLI or ffmpeg-based MV-HEVC encoding
- [ ] Metadata: inject `baseline`, `FOV`, `disparity` metadata fields
- [ ] Export dialog: "Apple Vision Pro (.mvhevc)" option
- [ ] File plays correctly in Vision Pro with depth effect
- [ ] Test: export single spatial clip, transfer to Vision Pro, verify stereoscopic playback

---

### E05 — Motion Graphics Templates (200+)

**Files required:**
- `/src/remotion/templates/` (200 compositions)
- `src/components/panels/MoGRTPanel.tsx`
- `src/app/api/mogrt/render/route.ts`

**Acceptance:**
- [ ] 200 Remotion compositions covering: lower thirds (50), title cards (40), transitions (40), social overlays (30), end screens (20), other (20)
- [ ] Browse panel: filter by category, search by name, animated preview on hover
- [ ] Drag to timeline: creates Remotion render job, output overlaid on clip
- [ ] Editable properties: text content, colours, timing, fonts
- [ ] Render: `@remotion/renderer` generates video from composition, overlaid via FFmpeg

---

### E06 — AI-Generated MoGRT on Demand

**Files required:**
- `src/app/api/mogrt/route.ts`
- `src/lib/mogrt/MoGRTGenerator.ts`

**Acceptance:**
- [ ] User describes: "Animated lower third with teal glow, person name, title"
- [ ] Model 1 generates Remotion JSON (component tree + animation config)
- [ ] Remotion renders composition to video
- [ ] Added to user's personal template library for reuse
- [ ] Generation time <3 minutes for typical composition

---

### F03-F13 — Fairlight-Class Audio DAW

All 11 features are Ultimate-tier. Grouped for implementation:

**F03 (Parametric EQ):**
- [ ] Canvas graph showing frequency response curve
- [ ] 6 bands: LowShelf, Peak, Peak, Peak, Peak, HighShelf
- [ ] Drag nodes on canvas to adjust frequency + gain
- [ ] FFmpeg `equalizer` filter chain generated per band
- [ ] A/B compare (bypass toggle)

**F04 (Dynamics: Compressor/Gate/Limiter):**
- [ ] Threshold, ratio, attack, release, makeup gain per track
- [ ] FFmpeg `acompressor` for compressor, `agate` for gate
- [ ] Limiter: hard ceiling (0 dBFS by default)
- [ ] Gain reduction meter shows compression activity

**F05 (Reverb + Delay):**
- [ ] Reverb: room size, decay, wet/dry — FFmpeg `areverb`
- [ ] Delay: time (ms), feedback, wet/dry — FFmpeg `aecho`
- [ ] Send/return routing: aux send from any track to reverb bus

**F06 (De-esser):**
- [ ] Frequency band selector for sibilance (~5-10 kHz typical)
- [ ] Threshold + depth controls
- [ ] FFmpeg dynamic EQ on sibilance band

**F07 (Dolby Atmos):**
- [ ] Audio beds (7.1.2 ambisonics) + audio objects (point sources)
- [ ] 3D panner: X/Y/Z position per object
- [ ] Export: `.atmos` format for theatrical delivery
- [ ] Metadata injected into export per Dolby spec

**F08 (AI IntelliCut):**
- [ ] Whisper transcript → identify silence > threshold
- [ ] Preview list of silences with timestamps
- [ ] "Remove all" or selective removal
- [ ] FFmpeg trims silences, re-joins with zero-crossing detection (no pop)

**F09 (Speaker Separation):**
- [ ] fal.ai audio separation model
- [ ] Input: mixed audio track
- [ ] Output: separate stems (voice 1, voice 2, background music, ambient)
- [ ] Each stem on its own track for individual processing

**F10 (AI Dialogue Matcher):**
- [ ] Select "reference" take (best performance)
- [ ] System analyses EQ profile of reference
- [ ] Applies matching EQ to selected takes (makes all takes sound consistent)
- [ ] Critical for ADR matching production audio

**F11 (ADR Loop Recorder):**
- [ ] Web Audio API recorder
- [ ] Loop playback of reference audio while recording
- [ ] Visual guide: waveform shows where to speak
- [ ] New takes appear as alternative clips, user picks best

**F12 (Foley Recorder):**
- [ ] Same as F11 but synced to video playback (not just audio)
- [ ] Frame marker at sync points
- [ ] Recordings added to foley track with correct timestamps

**F13 (Stem Export Buses):**
- [ ] Three output buses: Dialogue, Music, SFX (user-configurable)
- [ ] Each audio track assigned to a bus
- [ ] Export: 3 separate audio files + combined mix
- [ ] Format: WAV 24-bit 48kHz per stem (standard delivery)

---

### H02 — Smart Highlight Extraction

**Files required:**
- `src/app/api/highlights/route.ts`
- `src/lib/editing/HighlightExtractor.ts`

**Acceptance:**
- [ ] Input: long video (up to 60 min)
- [ ] Whisper transcript → Model 1 scores each segment (emotional peak, key information, entertainment value)
- [ ] Output: 5–20 short clips (30–90s each) ranked by score
- [ ] User can edit selection, approve
- [ ] Auto-reframe to 9:16 for social (A12)
- [ ] Auto-caption added (Whisper + styled captions)
- [ ] Batch export all highlights to different destinations

---

### H03 — Direct Social Publishing

**Files required:**
- `src/lib/social/Publisher.ts`
- `src/app/api/social/publish/route.ts`
- `src/components/panels/PublishPanel.tsx`

**Acceptance:**
- [ ] Connect: TikTok Creator API, Instagram Graph API, YouTube Data API v3
- [ ] OAuth flows for all three platforms (separate per-platform)
- [ ] Publish form: title, description, hashtags, schedule (immediate or later)
- [ ] Multi-platform: publish same video to all 3 simultaneously
- [ ] Status: show "Published" + link after success; "Failed" + retry on error
- [ ] Analytics: basic view count fetched from each platform after 24h

---

### H04 — Platform Auto-Reframe

*(Combined with A12 — share same engine)*

---

### H05 — Brand Kit Auto-Apply

**Files required:**
- `src/lib/brand/BrandKitApply.ts`
- `src/app/api/brand/route.ts`
- `src/components/panels/BrandKitPanel.tsx`
- Prisma model: `BrandKit`

**Acceptance:**
- [ ] Brand kit: logo file, primary/secondary colours, font selection, lower-third template
- [ ] "Apply brand kit" to project: inserts logo watermark, applies brand colours to MoGRTs, applies brand fonts
- [ ] Multiple brand kits per user (e.g., "Personal", "Agency Client A")
- [ ] Export with brand applied (logo burned into output if selected)
- [ ] Quick remove brand: toggle per export

---

### J03 — Multi-Camera Editor

**Files required:**
- `src/components/editor/MultiCam.tsx`
- `src/lib/timeline/MultiCamSync.ts`

**Acceptance:**
- [ ] Import multiple clips shot simultaneously (SMPTE timecode sync)
- [ ] Multi-cam monitor: 4-up grid showing all cameras in sync
- [ ] Click a camera in grid: switches to that angle at playhead position
- [ ] Auto-sync: YOLO detects actors across cameras for alignment
- [ ] Output: flattened single-track edit with correct angle switches

---

### K03-K06 — Export & Delivery Suite

**K03 (DCP):**
- [ ] Python DCP microservice running on port 7433
- [ ] `src/app/api/export/dcp/route.ts` → calls microservice
- [ ] Output: DCP package folder with ASSETMAP, CPL, PKL, MXF video + audio
- [ ] Validated against DCI spec
- [ ] Subtitle track inclusion (if project has captions)

**K04 (IMF):**
- [ ] Python IMF microservice (same service, port 7433)
- [ ] Output: IMF package passing Netflix validation toolset
- [ ] HDR and SDR deliverables in same package

**K05 (C2PA):**
- [ ] `src/lib/export/C2PAInject.ts`
- [ ] C2PA manifest: creator identity (user's account), tool used (Cinematic Forge), timestamp
- [ ] Injected into MP4, ProRes, and all other export formats via FFmpeg `-metadata`
- [ ] Visible in Adobe's Content Authenticity Inspect tool

**K06 (OCIO-correct export):**
- [ ] `src/lib/export/OCIOExport.ts`
- [ ] ACES output transform applied at export time
- [ ] Export targets: Rec.709, Rec.2020, P3-DCI, ACES2065-1
- [ ] Correct colour metadata embedded in output

---

### L01 — Plugin API + npm SDK

**Files required:**
- `src/app/api/plugin/` directory
- `/packages/cinematic-forge-sdk/` (separate package)

**Acceptance:**
- [ ] API key authentication (separate from user login)
- [ ] Endpoints: `GET /api/plugin/projects`, `POST /api/plugin/generate`, `GET /api/plugin/jobs/[id]`, `POST /api/plugin/clips/add`
- [ ] Rate limiting: 100 req/min per API key
- [ ] npm SDK: `cinematic-forge-sdk` published to npm
- [ ] SDK methods: `generateClip()`, `addClipToTimeline()`, `getJobStatus()`
- [ ] Documentation: API reference + quickstart guide

---

### N01-N04 — Avatar System (complete)

**Files required:**
- `src/app/api/avatar/create/route.ts`
- `src/app/api/avatar/list/route.ts`
- `src/app/api/avatar/generate/route.ts`
- `src/components/panels/AvatarCreator.tsx`
- `src/components/panels/AvatarGallery.tsx`
- `src/components/panels/TalkingPhotoPanel.tsx`

**Acceptance:**
- [ ] Create avatar: webcam capture or photo upload → fal-ai/sadtalker model
- [ ] Stock library: 30+ pre-generated avatars with names (business, creative, casual)
- [ ] Talking photo: upload portrait → enter script → ElevenLabs voice → lip-synced video
- [ ] Script-to-avatar: write script, pick avatar, auto-generate full talking video
- [ ] All 4 avatar sub-features accessible from Simple mode navigation
- [ ] Generated videos added to timeline as clips

---

### O01-O03 — Client Review Portal (complete)

**Files required:**
- `GET /api/review/[token]/comments` — returns all comments for review link
- `POST /api/review/[token]/approve` — marks review as approved

**Acceptance:**
- [ ] GET comments: returns `{ comments: ReviewComment[], status: 'pending'|'approved'|'rejected' }`
- [ ] POST approve: sets `ReviewLink.status = 'approved'`, notifies creator
- [ ] Review page: `/review/[token]` shows video + comment thread + approve button
- [ ] Email notification to creator when client approves

---

### O04-O06 — Workflow Complete

**O04 (Video Translation):**
- [ ] Upload/select clip → pick target language (29 options)
- [ ] Whisper transcribes → Claude Sonnet translates → ElevenLabs voices in target language
- [ ] SadTalker applies lip sync to match translated audio
- [ ] Result added to timeline as new clip

**O05 (Overdub):**
- [ ] Select word/phrase in transcript editor
- [ ] Type replacement text
- [ ] ElevenLabs generates replacement audio matching speaker's voice
- [ ] FFmpeg splices replacement at exact word boundaries
- [ ] No audible discontinuity

**O06 (Stock Asset Library):**
- [ ] Pexels API: search photos + videos by keyword
- [ ] FMA (Free Music Archive) API: search royalty-free music
- [ ] Browse panel: filter by type (photo/video/music), search bar
- [ ] Drag to timeline: video/photo as clip or B-roll; music to audio track
- [ ] Attribution: Pexels/FMA attribution stored in project metadata

---

### GROUP P — ALL INFRASTRUCTURE ITEMS

**P01 — vocabulary.ts:**
```typescript
// src/lib/firewall/vocabulary.ts
// Strips all VLM/model names from any text going to marketing domain

const BANNED_VLM_NAMES = [
  'Kling', 'Seedance', 'SkyReels', 'Veo', 'HunyuanVideo',
  'LTX', 'CogVideoX', 'Minimax', 'Wan', 'Luma', 'Runway',
  'Pika', 'Flux', 'SDXL', 'fal.ai', 'Llama', 'Mochi',
]

export function sanitiseForMarketing(text: string): string {
  let clean = text
  for (const name of BANNED_VLM_NAMES) {
    clean = clean.replace(new RegExp(name, 'gi'), '[AI model]')
  }
  return clean
}
```
- [ ] File exists at correct path
- [ ] All marketing API calls pass through sanitiseForMarketing()
- [ ] Test: input containing "Kling 3.0" returns "[AI model] 3.0" or stripped

**P02 — Routing rename:**
- [ ] `src/lib/swarm/` → `src/lib/routing/` (all files moved)
- [ ] `src/lib/models/` → `src/lib/engines/` (all files moved)
- [ ] All imports in codebase updated
- [ ] Old routes kept as aliases: `POST /api/swarm/*` → `POST /api/generate/*`
- [ ] TypeScript compiles with zero errors after rename

**P03 — Signup 3-step:**
- [ ] `/signup` route exists
- [ ] Step 1: account details (name, email, password or Google)
- [ ] Step 2: PlanSelector component (Free/Pro/Studio/Ultimate with pricing)
- [ ] Step 3: PaymentOptions (Stripe only — card, Apple Pay, Google Pay)
- [ ] On complete: user created + subscription created + redirect to editor

**P04 — TokenBar:**
- [ ] `src/components/layout/TokenBar.tsx` exists
- [ ] Shows: credit balance, tier badge, "Buy Credits" button
- [ ] Visible on all authenticated pages (not landing page)
- [ ] Real-time update when credits spent
- [ ] Low credit warning at 10% remaining (yellow pulse)

**P05 — Stripe payment routes (PayPal removed):**
- [ ] `POST /api/payments/deposit` — Stripe Customer Balance deposit
- [ ] `POST /api/payments/credit-pack` — one-time credit pack purchase
- [ ] `POST /api/payments/subscribe` — subscription checkout
- [ ] `POST /api/webhooks/stripe` — handles all payment + subscription events
- [ ] Credits added to user account on webhook receive

**P06 — Simple mode UI components:**
- [ ] `TierSelector` component: shows Quick Draft/Standard/Cinematic/Film Grade radio
- [ ] `GenerationProgress` component: SSE progress bar with percentage + stage label
- [ ] `AutoSocialDrop` component: drag-and-drop zone for Auto-Social mode
- [ ] All three wired to Zustand store and generation flow

**P07 — Landing page components:**
- [ ] `HeroSection.tsx` — above fold, headline, CTA, demo video/animation
- [ ] `FeatureSection.tsx` — 6 key features with icons
- [ ] `PricingSection.tsx` — all 4 tiers with toggle monthly/yearly
- [ ] `Footer.tsx` — links, social, legal
- [ ] All components hydrate correctly (no layout shift)

**P08 — Missing workers:**
- [ ] `src/workers/training-pipeline.ts` — processes training data queue
- [ ] `src/workers/distillation.ts` — runs distillation jobs
- [ ] `src/workers/quality-gate.ts` — validates trained weights before deploy
- [ ] All three workers registered in BullMQ worker pool
- [ ] All three have error handling + dead-letter queue

**P09 — Brain model files:**
- [ ] `src/lib/brain/model2.ts` — Mochi inference interface
- [ ] `src/lib/brain/orchestrator.ts` — coordinates Model 1 + Model 2 + Council
- [ ] Both files export correct TypeScript interfaces
- [ ] Orchestrator handles fallback: if Model 1 unavailable → Council fallback

**P10 — Dev account seed:**
```typescript
// prisma/seed.ts
// npx prisma db seed

async function main() {
  await prisma.user.upsert({
    where: { email: 'innovative.trailers@gmail.com' },
    create: {
      email: 'innovative.trailers@gmail.com',
      name: 'INNOVATIVE',
      role: 'ADMIN',
      creditBalance: 9999999,
      tier: 'ultimate',
    },
    update: { role: 'ADMIN', creditBalance: 9999999 },
  })
}
```
- [ ] File exists at `prisma/seed.ts`
- [ ] `package.json` includes `"prisma": { "seed": "ts-node prisma/seed.ts" }`
- [ ] `npx prisma db seed` runs without errors
- [ ] Admin account bypasses `checkAndDeductCredits()` everywhere

**P11 — ENV vars complete:**
- [ ] All vars from `CINEMA_gap_fill_prompt.md` GAP 10 section are populated in `.env.local`
- [ ] `.env.example` lists ALL required vars with descriptions
- [ ] Startup validation: `src/lib/config/validateEnv.ts` — app refuses to start if critical vars missing

---

## COMBINED SPRINT SEQUENCE (V1 Remaining + V2 New)

All V1 partial/missing work must be completed BEFORE V2 new features start.

### PHASE 1 — COMPLETE V1 (Sprints 1-18)

| Sprint | Work | Features |
|---|---|---|
| 1 | Infrastructure: routing rename, vocabulary.ts, workers, brain files, seed | P01, P02, P08, P09, P10 |
| 2 | Payments: Stripe Customer Balance + credit packs + subscriptions + signup flow + TokenBar | P03, P04, P05 |
| 3 | Simple mode UI: TierSelector, GenerationProgress, AutoSocialDrop, landing components | P06, P07, C05 |
| 4 | ENV vars: all remaining + startup validation + documentation | P11 |
| 5 | Avatar system: all 4 routes + 3 UI components | N01, N02, N03, N04 |
| 6 | Review portal: GET comments + POST approve + O04 (translation) + O05 (overdub) + O06 (stock) | O01, O03, O04, O05, O06 |
| 7 | Timeline tools: A06 (optical flow), A07 (stabilise), A08 (morph cut), A13 (clip extend) | A06, A07, A08, A13 |
| 8 | Transcript + audio AI: A09, A10, A11 + F08 (IntelliCut) | A09, A10, A11, F08 |
| 9 | Auto Reframe + social publishing + highlight extraction | A12, H02, H03, H04 |
| 10 | Brand kit + stock library + storyboard + multi-cam | H05, C07, J03 |
| 11 | Colour science: B01, B02, B03, B04, B05, B06, B07, B12 | B01-B07, B12 |
| 12 | VFX tools: D06, D07, D08+E08, D09, D12, D13, D14, D15 | D06-D09, D12-D15 |
| 13 | Motion graphics: E05 (200 templates), E06 (AI MoGRT), E09, E10 | E05, E06, E09, E10 |
| 14 | Audio DAW Part 1: F03, F04, F05, F06, F07 | F03-F07 |
| 15 | Audio DAW Part 2: F09, F10, F11, F12, F13 | F09-F13 |
| 16 | Export suite: K03 (DCP), K04 (IMF), K05 (C2PA), K06 (OCIO) | K03-K06 |
| 17 | Plugin API + npm SDK | L01 |
| 18 | E01 (text-to-3D), all remaining E-series, spatial D15 final | E01, D15, V2-07 partial |

### PHASE 2 — V2 NEW FEATURES (Sprints 19-33)

| Sprint | Work | Features |
|---|---|---|
| 19 | Emotion Lattice engine + timeline UI + API | V2-01 |
| 20 | Effect-aware object removal + FAL EffectErase integration | V2-02 |
| 21 | Wireless camera ingest — backend + workers | V2-03 |
| 22 | Wireless camera ingest — mobile UI + WebRTC | V2-03 (cont) |
| 23 | Real-time multiplayer editing — OT/CRDT + presence | V2-05 |
| 24 | Real-time multiplayer editing — conflict resolution + UI | V2-05 (cont) |
| 25 | Rough cut copilot — footage analysis + assembly | V2-04 |
| 26 | AI colour grading suggestions | V2-06 |
| 27 | Shoppable export + product tagging UI | V2-08 |
| 28 | Shopify + WooCommerce integration | V2-09, V2-10 |
| 29 | Unreal Engine Sequencer export | V2-11 |
| 30 | Project importer (Premiere/DaVinci/CapCut) | V2-12 |
| 31 | Interactive branching video export | V2-15 |
| 32 | Multi-user review with timestamps (extends O01-O03) | V2-14 |
| 33 | Final QA, hardening, performance, security audit | All |

---

## DEFINITION OF DONE — V2 COMPLETE

Cinematic Forge V2 ships when:

**All 121 rows in the master table above are ✅**

Specifically:
- [ ] All 44 ❌ V1 missing features fully built
- [ ] All 17 ⚠️ V1 partial features fully completed
- [ ] All 15 Group P infrastructure items complete
- [ ] All 15 Group Q V2 new features built
- [ ] Zero features ship as stub, placeholder, or "coming soon"
- [ ] All acceptance criteria above pass in testing
- [ ] Performance: all API endpoints p95 <500ms
- [ ] Security audit: passed
- [ ] Test coverage: >80% business logic
- [ ] All 33 sprints complete and signed off

---

## CURSOR FEED ORDER — V2 COMPLETE

Feed these documents to Cursor in this exact order:

1. `CINEMA_Master_Roadmap.md` — architecture, naming, file structure
2. `CINEMA_cursor_prompt.md` — primary build spec
3. `CINEMA_swarm_upgrade.md` — routing engine
4. `CINEMA_film_series_mode.md` — film/series/character
5. `CINEMA_studio_gap_closure.md` — Hollywood pipeline
6. `CINEMA_intelligence_firewall.md` — knowledge firewall
7. `CINEMA_cursor_prompt_addendum.md` — payments, landing, dev account
8. `CINEMA_gap_audit_consolidation.md` — conflict resolution
9. `CINEMA_complete_wiring.md` — all stores, toolbars, keyboard shortcuts
10. `CINEMA_gap_fill_prompt.md` — surgical fixes for 68→106 features
11. `CINEMA_preview_player.md` — full studio player
12. `CINEMA_project_importer.md` — project import from other apps
13. `CINEMA_v2_features.md` — V2 new feature specs
14. `CINEMA_v2_completion_checklist.md` — V2 completion criteria
15. `CINEMA_ui_workers_completion.md` — store types, panels, unwired UI, worker files
16. **`CINEMA_v2_master_complete.md`** ← THIS DOCUMENT — final authority

---

*This is the only document that defines "complete" for Cinematic Forge V2.*  
*121 features. Every acceptance criterion defined. Nothing ships half-baked.*  
*Last updated: May 2026*
