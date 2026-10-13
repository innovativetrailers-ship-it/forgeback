# SPEC PHASE 5 — UI SURFACE MAP + LOCATION→SCENERY→DIRECTOR PIPELINE
## Two parts: (A) every UI surface → handler → route → contract, per workspace,
## per host; (B) the Location pipeline (Mapillary street view → reference image →
## grounded generation), a first-class dependency like the character system.
## Imports Phase 1 types; references Phase 2-4 stages.

═══════════════════════════════════════════════════════════════════════
# PART A — UI SURFACE MAP
═══════════════════════════════════════════════════════════════════════
## FORMAT: every interactive element is a row: SURFACE → HANDLER → ADAPTER/ROUTE →
## CONTRACT. "Wired" means all four exist and the contract matches Phase 1-4.
## HOST: [both] = core (web+desktop) | [desktop] = heavy/flagship-only.
## The renderer NEVER sees model names (Intelligence Firewall) — UI speaks tiers/roles.

── WORKSPACE: SCRIPT [both] ──
| Surface | Handler | Adapter/Route | Contract |
|---|---|---|---|
| Prompt textarea + Generate | onGenerate | cognitiveDirector→breakdown | {prompt}→CreativeBrief+Shot[] |
| Parse & Plan Shots | onParse | breakdown (Stage 1) | →ShotDraft[] |
| Script import | onImport | adapter.saveProject | file→Project |

── WORKSPACE: STORYBOARD [both] ──
| Storyboard grid | render | adapter.getShots | Shot.anchorFrameUrl(keyframe) |
| Regenerate keyframe | onRegenKeyframe | Stage 0 generateKeyframe | shot→keyframe url |

── WORKSPACE: AI DIRECTOR [both] — the core generation surface ──
| Direct This Film | onDirectFilm | enqueue(film-generate) | Project→job |
| Direct Shot N (card) | onDirectShot | enqueue(shot-generate) | Shot→job |
| AwaitingDirectionCard | render | getShots (status filter) | Shot(awaiting_direction) |
| Anchor frame block | render+onAnchorChange | Stage 4 / manual set | anchorFrameUrl |
| Model/tier picker | onSelectTier | writes Shot.selectedModelId | tier→modelId (firewall) |
| Manual model override | onOverride | sets modelOverride=true | selectedModelId |
| Mark failed / retry | onRetry | enqueue (idempotent) | Shot.status |
| Quality tier (Draft/Studio/Blockbuster) | onTier | ProjectSettings.qualityTier | tier |

── WORKSPACE: CAST [both] — character system UI (Phase 4) ──
| Cast panel list | render | adapter.getCharacters | Character[] |
| Create character | onCreate | createCharacter (P4) | {name,descriptor,img?}→Character |
| Upload/swap reference | onSwapRef | generateCharacterReference | →referenceImageUrl+seed |
| Assign to shot | onAssign | shot.characterIds.push | activates persistence chain |
| Set wardrobe | onWardrobe | updateContinuity | working memory |
| Voice assign/clone | onVoice | assignVoice (P4-3) | →voiceId |

── WORKSPACE: LOCATIONS [both] — see PART B for the full pipeline ──
| Location search | onSearch | geocode+Mapillary (PART B) | address→Location plate |
| Street view browser | render | Mapillary API | photos[] |
| 3D aerial (Cesium) | render | Cesium [desktop-heavier] | plate |
| Assign location to shot | onAssignLoc | shot.locationId set | grounds generation |
| Location vault | render | adapter.getLocations | Location[] |

── WORKSPACE: TIMELINE / EDITOR [both core, depth desktop] ──
| Timeline tracks render | render | single store + reconcile | Clip[] |
| Play/pause/scrub transport | safePlay/safePause | media clock | playhead |
| Clip (thumbnail/red-empty) | render | Clip.sourceUrl/posterUrl | Clip |
| +Timeline (Simple) | onAddClip | shared store addClip | Shot→Clip |
| Download clip | href | adapter.saveFileDialog/proxy | Shot.videoUrl |
| Select/Razor/Trim [both] | edit ops | timeline store | Clip mutations |
| Slip/Slide/Multicam/Proxy [desktop] | edit ops | desktop NLE module | heavy |
| Fullscreen | onFullscreen | container + iOS fallback | — |
| Export Film | onExport | assembleFilm (Stage 6) | Clip[]→file |

── WORKSPACE: COLOUR [both min / desktop deep] ──
| LUT apply + basic wheels [both] | onGrade | color module (core) | clip→graded |
| Node graph, scopes, Micro Colour, ACES [desktop] | — | color module (heavy) | heavy |

── WORKSPACE: VFX [both min / desktop deep] ──
| Effects search + drop (~20 hero) [both] | onDropEffect | effect asset lib | prompt-match→asset |
| Node compositor, keying, tracking [desktop] | — | vfx module (heavy) | heavy |

── WORKSPACE: AUDIO MIX [both min / desktop deep] ──
| Track mix + levels [both] | onMix | audio module (core) | stems→mix |
| Music gen (Suno) [both] | onGenMusic | Stage 7 | brief→music |
| Voice (ElevenLabs) [both] | onGenVoice | Stage 7 | character→stem |
| SFX Makeup [both] | onSFX | Stage 7 (deferred SFX) | prompt→sfx |
| Fairlight/Spectrum EQ/Master Suite [desktop] | — | audio module (heavy) | heavy |

── WORKSPACE: FORGEFLOW [desktop] / FORGEREVIEW [desktop] ──
| Shot status board | render | Shot.status | 8-stage workflow |
| Share/review link | onShare | ForgeReview module | Clip→link |
(Full parity = desktop heavy modules; interfaces exist in core for status sync.)

UI-MAP CURSOR PROMPT:
```
Audit and wire every surface in spec-5 Part A. For EACH row confirm all four
exist: UI element, handler, adapter/route, matching contract. Any surface that
renders without a wired handler (the Simple-mode buttons / project-load / anchor
card bugs) is a FAILURE — fix by wiring to the named handler. Core surfaces
[both] work on web+desktop via the HostAdapter; heavy [desktop] surfaces are not
mounted on web (feature filter, Phase F). Renderer contains no model names
(firewall). Produce a checklist of surface→handler→route→contract with pass/fail.
```

═══════════════════════════════════════════════════════════════════════
# PART B — LOCATION → SCENERY → DIRECTOR PIPELINE
═══════════════════════════════════════════════════════════════════════
## The street-view-to-generation thread. A real Mapillary photo of a place becomes
## the reference_image_url that grounds a shot in that real location — same wiring
## shape as the character reference, but for ENVIRONMENT identity.

── B1. LOCATION CAPTURE (search → plate) ──
```typescript
searchLocation(query: string, ctx): Promise<LocationCandidate[]>
// 1. geocode(query) → coords  (Nominatim/OpenStreetMap)
// 2. Mapillary API → street-level photos at coords (multiple angles/bearings)
// 3. ArcGIS → satellite tile (overhead)
// 4. Cesium → 3D aerial view [heavier; desktop-primary]
interface LocationCandidate {
  label: string; coords: {lat,lng}
  streetPhotos: { url: string, bearing: number, capturedAt: string }[]
  satelliteUrl: string
}
createLocationPlate(candidate, chosenPhotoUrl, ctx): Promise<Location>
// User picks the best street photo → mirror it to origin → Location.plateUrl.
// Saved in the vault, reusable across projects.
```

── B2. LOCATION → SHOT BINDING ──
```typescript
// In the Director UI, assign a Location to a shot → shot.locationId set.
// A shot can have BOTH a character (identity) and a location (environment).
assignLocation(shotId, locationId): void
```

── B3. LOCATION → GENERATION (the grounding — the key wiring) ──
```typescript
// In buildPayload (Stage 3), when shot.locationId set:
const loc = await adapter.getLocation(shot.locationId)
if (loc?.plateUrl) {
  if (modelSupportsRefImage(endpoint)) {
    payload.reference_images = [...(payload.reference_images ?? []), loc.plateUrl]
    // location plate joins character refs as a conditioning image
  } else if (!shot.anchorFrameUrl) {
    payload.image_url = loc.plateUrl   // fallback: plate as I2V seed if no anchor
  }
  // ALSO inject location descriptor into the prompt for text reinforcement:
  // "...at [Shibuya crossing: neon-lit intersection, wet pavement, dense signage]"
}
```
PRIORITY when a shot has anchor + character-ref + location-plate (all 3 possible):
1. anchorFrameUrl (temporal continuity) → image_url for I2V, OR
2. reference_images array = [character refs..., location plate] for multi-ref models
3. descriptor injection (character + location) into the prompt always applies
The exact combination depends on model capability (flags on ModelDef). The
Casting Director (Phase 3) can PREFER a multi-ref-capable model (Seedance) when a
shot needs both character AND location grounding.

── B4. THE FULL THREAD (street view → grounded shot) ──
```
Locations UI: search "Shibuya crossing"
  → geocode → Mapillary street photos + ArcGIS satellite + Cesium 3D
  → user picks a real street photo → createLocationPlate → Location.plateUrl (mirrored)
  → vault (reusable)
     ↓
Director UI: assignLocation(shot, location) → shot.locationId
     ↓
Stage 3 buildPayload: plateUrl → reference_images (or I2V fallback)
                    + location descriptor → prompt injection
     ↓
Model generates footage ANCHORED to the real place: the architecture, light
quality, signage density of the real Shibuya come through in the AI footage.
     ↓
Result: a shot that looks shot-on-location, grounded by a real photograph.
```

LOCATION-PIPELINE CURSOR PROMPT:
```
Implement the Location pipeline per spec-5 Part B. searchLocation (Nominatim
geocode + Mapillary street photos + ArcGIS satellite; Cesium 3D aerial is
desktop-primary/heavy). createLocationPlate mirrors the chosen photo to origin →
Location.plateUrl, saved to the vault. assignLocation sets shot.locationId. In
buildPayload (Stage 3): plateUrl joins reference_images for multi-ref models (or
I2V fallback), plus location descriptor injected into the prompt. A shot may carry
anchor + character-refs + location-plate simultaneously; resolve by model
capability flags. Verify: assign a real location to a shot → generated footage
reflects that location's visual character.
```

## VERIFY (Part A + B)
A. Every surface row has a wired handler→route→contract (no orphan buttons).
B. Heavy surfaces absent on web, present on desktop (feature filter holds).
C. Renderer bundle contains no model names (firewall).
D. Search a real place → street photos returned → plate saved to vault.
E. Assign location to a shot → buildPayload includes the plate as reference +
   descriptor in prompt.
F. A shot with character + location → both the character ref and location plate
   condition the generation (multi-ref model), consistent identity IN that place.

## NEXT
Phase 5 (this doc) = full UI surface map + the location→scenery→director pipeline.
Say "next" for PHASE 6 (final) — Cross-Cutting & Integration Index: the six
chokepoints as enforced contracts, the commodity-feature interfaces, and the
MASTER WIRING INDEX that proves every dependency in the showcase is linked to a
contract — the definitive "is everything specced and wired" answer, plus the
build-sequence checklist to begin implementation.
