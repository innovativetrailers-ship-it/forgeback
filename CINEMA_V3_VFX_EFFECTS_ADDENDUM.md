# CINEMATIC FORGE V3 — FORGE VFX EFFECTS SYSTEM ADDENDUM
## `CINEMA_V3_VFX_EFFECTS_ADDENDUM.md`
### Practical Effects Library + AI Prompt VFX Generation
### Feeds AFTER `CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md` (Position 19 in feed order)

---

> **THIS DOCUMENT EXPANDS Group C (VFX/Compositing) in V3 Master Architecture.**
> It adds two complete systems that must be fully implemented:
>
> **SYSTEM 1 — FORGE FX LIBRARY:** A categorised library of 200+ pre-rendered,
> production-grade practical effects (explosions, glass, crashes, weather, energy, etc.)
> that composite directly into any timeline clip without generation time.
>
> **SYSTEM 2 — FORGE VFX AI GENERATOR:** A text-to-VFX pipeline where a user
> describes any effect in natural language, the system generates it and composites it
> seamlessly into the target clip using the optimal 2026 model for each effect type.
>
> Both systems integrate with the existing node compositor and timeline.
> Nothing ships as a stub. Every effect in the library must play and composite correctly.

---

## SYSTEM 1 — FORGE FX LIBRARY
### 200+ Production-Grade Pre-Rendered Effects

### Architecture

```
STORAGE FORMAT:
  Each effect is a pre-rendered sequence stored as:
    - Alpha channel: ProRes 4444 .mov (best quality, lossless alpha)
    - Proxy: H.264 .mp4 with premultiplied alpha for browser-preview
    - Thumbnail: animated .webp (2s loop, 320×180)
    - Metadata: effect.json (blend mode, track recommendation, scale, tags, timing)
  
  Location: /resources/vfx/{category}/{effect_id}/
  Total bundled size: ~4GB (ProRes) / ~800MB (proxies only in app bundle)
  Full library: downloadable from Forge Cloud on first launch
  
COMPOSITE STRATEGY:
  Each effect carries a recommended blend_mode property:
    'add'         — fire, light, energy beams, flares (adds luminosity to shot)
    'screen'      — sparks, smoke (above dark backgrounds), glows
    'multiply'    — shadows, darkening overlays
    'normal'      — effects with full alpha (glass shards, debris with solid backing)
    'overlay'     — dust, atmospherics layered on scene
    'hard_light'  — lightning, flashes, bright impact
  
  User can always override the recommended mode.
  
SCALE SYSTEM:
  Every effect is rendered at a canonical 'scene_scale' rating:
    xs  — tabletop, personal space (bottle break, lighter spark)
    s   — room scale (window shatter, interior fire)
    m   — vehicle scale (car crash, grenade, building section)
    l   — building scale (structure collapse, large explosion)
    xl  — environmental scale (earthquake, forest fire, aerial explosion)
  
  The system auto-scales the effect when dropped onto a clip based on frame content,
  but user always has full manual control.
```

### Effect Metadata Schema

```typescript
interface VFXEffect {
  id: string
  name: string
  category: VFXCategory
  subcategory: string
  tags: string[]
  duration_frames: number      // at 24fps
  fps_native: number           // 24 / 30 / 60 / 120
  resolution: '1080p' | '2k' | '4k'
  has_alpha: boolean
  alpha_mode: 'premultiplied' | 'straight'
  blend_mode_recommended: BlendMode
  scene_scale: 'xs' | 's' | 'm' | 'l' | 'xl'
  loop_able: boolean           // can loop seamlessly
  loop_start_frame: number
  loop_end_frame: number
  has_sound: boolean           // bundled audio stem
  audio_stem_path: string | null
  anchor_point: 'center' | 'bottom' | 'impact_point' | 'emission_point'
  ai_prompt_match: string[]    // phrases that fuzzy-match this effect in AI search
  preview_path: string
  full_path: string
  proxy_path: string
  licensor: string             // 'forge_original' | 'cc0' | partner
}
```

### Complete Effects Library — 9 Categories, 200+ Effects

---

#### CATEGORY 1: PYRO (Fire, Smoke, Explosions) — 42 effects

```
EXPLOSIONS:
  FX-P001   Micro Explosion         — grenade, small device [xs] 18f
  FX-P002   Car Bomb                — vehicle-scale fireball [m] 36f
  FX-P003   Building Section Blast  — structural explosion [l] 60f
  FX-P004   Military Grade Detonation — massive shockwave + fireball [xl] 90f
  FX-P005   Underground Explosion   — upward vent, debris fountain [m] 48f
  FX-P006   Chemical Explosion      — purple/green tinted blast cloud [m] 42f
  FX-P007   Gas Canister Blast      — horizontal + vertical fireball [s] 30f
  FX-P008   Suicide Vest Impact     — close-range, dirty blast [s] 24f (adult content warning)
  FX-P009   Aerial Bomb Drop        — impact + delayed expansion [xl] 72f
  FX-P010   Underwater Detonation   — sub-surface bubble/shockwave [l] 60f

FIRE:
  FX-P011   Candle Flame            — single flame, loopable [xs] 24f loop
  FX-P012   Torch Flame             — larger, flickering [xs] 30f loop
  FX-P013   Surface Fire (small)    — floor/table fire [s] 30f loop
  FX-P014   Surface Fire (large)    — room-scale spread [m] 48f loop
  FX-P015   Fire Wall               — vertical barrier flame [m] 36f loop
  FX-P016   Building Interior Fire  — window-visible interior [l] 60f loop
  FX-P017   Car on Fire             — full vehicle engulfed [m] 48f loop
  FX-P018   Fireball Rolling        — horizontal rolling fireball [m] 36f
  FX-P019   Fireball Vertical       — vertical burst (fuel ignition) [m] 30f
  FX-P020   Backdraft               — sudden interior fire bloom [m] 36f
  FX-P021   Molotov Cocktail        — impact + spread [s] 24f
  FX-P022   Burning Debris          — scattered burning fragments [m] 60f loop

SMOKE:
  FX-P023   Black Smoke Plume       — upward rising column [m] 120f loop
  FX-P024   White Steam Vent        — industrial/chemical steam [s] 60f loop
  FX-P025   Smoke Wisps (ambient)   — light atmospheric smoke [s] 90f loop
  FX-P026   Gunfire Smoke Trail     — artillery/mortar smoke [m] 48f loop
  FX-P027   Tire Smoke              — vehicle burnout/drift [s] 30f loop
  FX-P028   Chemical Smoke (coloured) — yellow/green toxic plume [m] 90f loop

EMBERS/SPARKS:
  FX-P029   Ember Shower            — falling glowing embers [m] 90f loop
  FX-P030   Spark Shower (metal)    — welding-style sparks [s] 24f loop
  FX-P031   Spark Burst (impact)    — electrical contact sparks [xs] 18f
  FX-P032   Incandescent Particles  — floating hot particles [m] 120f loop
  FX-P033   Flame Thrower Burst     — directional flame stream [m] 24f

SHOCKWAVE:
  FX-P034   Ground Shockwave Ring   — horizontal ring from impact [xl] 18f
  FX-P035   Air Shockwave           — visible pressure distortion [xl] 12f
  FX-P036   EMP/Energy Shockwave    — electromagnetic ring [xl] 24f
```

---

#### CATEGORY 2: DESTRUCTION & RBD (Glass, Concrete, Metal, Wood) — 38 effects

```
GLASS:
  FX-D001   Window Pane Shatter     — spider crack then collapse [s] 36f
  FX-D002   Window Bullet Impact    — hole + radial crack [s] 12f
  FX-D003   Glass Wall Implosion    — full panel fall [m] 48f
  FX-D004   Windshield Spider Crack — no break, held by film [s] 18f
  FX-D005   Windshield Full Shatter — collapse inward [s] 30f
  FX-D006   Drinking Glass Shatter  — tabletop break [xs] 18f
  FX-D007   Glass Ceiling Fall      — large overhead pane [m] 60f
  FX-D008   Bullet-Proof Glass Fail — multiple layers cracking [m] 36f
  FX-D009   Mirror Shatter          — vertical plane, 7 pieces [s] 24f
  FX-D010   Glass Bottle Smash      — floor impact [xs] 18f

CONCRETE/MASONRY:
  FX-D011   Concrete Block Crack    — surface fracture, no collapse [s] 24f
  FX-D012   Concrete Wall Breach    — section removal, debris [m] 48f
  FX-D013   Brick Wall Collapse     — section dominoes down [m] 72f
  FX-D014   Floor Collapse (slab)   — section falls through [m] 60f
  FX-D015   Ceiling Collapse        — debris falling from above [m] 60f
  FX-D016   Column Destruction      — structural pillar fails [l] 72f
  FX-D017   Building Pancake        — floor-on-floor implosion [xl] 120f
  FX-D018   Ground Crack/Fissure    — surface splits open [m] 48f
  FX-D019   Concrete Bullet Hits    — multiple impact craters [s] 6f per hit

METAL:
  FX-D020   Car Door Crumple        — side impact deformation [m] 24f
  FX-D021   Hood Crush              — front impact deformation [m] 24f
  FX-D022   Steel Beam Buckle       — structural failure bend [l] 48f
  FX-D023   Roof Collapse (metal)   — corrugated/industrial [m] 60f
  FX-D024   Pipe Burst              — pressurised fracture [s] 24f
  FX-D025   Container Dent/Breach   — large object impact [m] 36f

WOOD:
  FX-D026   Wooden Door Splinter    — impact breach [s] 24f
  FX-D027   Floorboard Crack        — body/weight impact [s] 18f
  FX-D028   Wooden Fence Shatter    — vehicle through fence [s] 30f
  FX-D029   Tree Fall               — trunk snap + fall [l] 72f
  FX-D030   Wooden Crate Explosion  — burst from inside [s] 18f

COMPOSITE DESTRUCTION:
  FX-D031   Car Crash (front)       — RBD full vehicle impact [m] 60f
  FX-D032   Car Crash (T-bone)      — side collision [m] 60f
  FX-D033   Car Rollover            — 3-roll sequence [m] 90f
  FX-D034   Motorcycle Crash        — slide + tumble [m] 60f
  FX-D035   Plane Crash Landing     — runway impact + slide [xl] 120f
  FX-D036   Helicopter Rotor Strike — tail fail + autorotation [l] 90f
  FX-D037   Train Derailment        — lead car jack-knife [xl] 120f
  FX-D038   Bridge Section Collapse — span fall into water [xl] 120f
```

---

#### CATEGORY 3: FLUID DYNAMICS (Water, Liquid, Blood) — 28 effects

```
WATER IMPACTS:
  FX-F001   Small Water Splash      — object into water [s] 24f
  FX-F002   Large Water Splash      — body/vehicle impact [m] 36f
  FX-F003   Surface Impact Ring     — concentric ripple expansion [m] 48f
  FX-F004   Wave Break              — shoreline wave [l] 60f
  FX-F005   Ocean Storm             — full-frame water chaos [xl] 90f loop
  FX-F006   Waterfall               — vertical cascade [m] 90f loop
  FX-F007   Underwater Bubbles      — upward rising [s] 60f loop
  FX-F008   Burst Water Main        — upward geyser [m] 48f

RAIN/WEATHER FLUID:
  FX-F009   Light Rain              — ambient, loopable [m] 120f loop
  FX-F010   Heavy Rain (storm)      — torrential with splash [m] 120f loop
  FX-F011   Rain on Window          — glass surface beads [s] 120f loop
  FX-F012   Flooding (rising water) — ground level fill [l] 120f loop

BLOOD:
  FX-F013   Blood Splatter (light)  — single hit, forward spray [xs] 12f
  FX-F014   Blood Splatter (heavy)  — exit wound, full burst [xs] 18f
  FX-F015   Blood Pool (spreading)  — floor level expansion [s] 60f loop
  FX-F016   Arterial Blood Spray    — pulsing directional [xs] 30f loop
  FX-F017   Blood on Glass          — splatter on transparent surface [s] 12f

OTHER LIQUID:
  FX-F018   Chemical Spill          — green/orange viscous spread [m] 60f
  FX-F019   Oil Leak                — dark spreading fluid [s] 60f loop
  FX-F020   Fuel Spill + Ignite     — liquid spread then ignition [m] 48f
  FX-F021   Lava Flow               — volcanic surface flow [xl] 120f loop
  FX-F022   Acid Drip               — dissolving impact on surface [xs] 30f
  FX-F023   Ink/Dye Drop (water)    — diffusion in liquid [xs] 60f
  FX-F024   Mercury Spill           — heavy metallic liquid [xs] 30f
```

---

#### CATEGORY 4: BALLISTIC & WEAPONS — 20 effects

```
MUZZLE FLASH:
  FX-B001   Pistol Muzzle Flash     — forward burst [xs] 3f
  FX-B002   Rifle Muzzle Flash      — larger, with smoke [xs] 4f
  FX-B003   Shotgun Flash           — wide dispersal [xs] 6f
  FX-B004   Machine Gun Continuous  — rapid sequence, loopable [xs] 24f loop
  FX-B005   Sniper Suppressed Flash — subtle, minimal [xs] 3f

BULLET IMPACT:
  FX-B006   Bullet Hit Concrete     — dust crater + debris [s] 12f
  FX-B007   Bullet Hit Metal        — spark shower [s] 6f
  FX-B008   Bullet Hit Wood         — splinter burst [xs] 9f
  FX-B009   Bullet Hit Dirt/Ground  — dust kick [s] 9f
  FX-B010   Bullet Hit Water        — entry splash + exit trail [s] 12f
  FX-B011   Multiple Impact Spray   — automatic fire hits [s] 24f
  FX-B012   Sniper Shockwave        — supersonic crack distortion [xl] 6f

EXPLOSIVES:
  FX-B013   Grenade Pin Pull + Throw — practical effect overlay [xs] 18f
  FX-B014   Frag Grenade Impact      — low-profile burst [s] 36f
  FX-B015   RPG Backblast           — rear propellant cloud [m] 18f
  FX-B016   RPG Impact              — direct hit explosion [m] 36f
  FX-B017   IED Roadside Blast      — asymmetric street explosion [l] 60f
  FX-B018   Tracer Rounds (stream)  — glowing bullet trails [m] 36f loop
  FX-B019   Flashbang Detonation    — white light overexposure [s] 12f
  FX-B020   Smoke Grenade Deploy    — coloured smoke screen [m] 90f loop
```

---

#### CATEGORY 5: ATMOSPHERIC & WEATHER — 22 effects

```
LIGHTNING:
  FX-W001   Lightning Strike (ground)   — bolt + flash + afterglow [xl] 12f
  FX-W002   Lightning Arc (cloud)       — between clouds [xl] 18f
  FX-W003   Chain Lightning             — branching multiple strike [l] 18f
  FX-W004   Ball Lightning             — hovering sphere [s] 36f loop
  FX-W005   Lightning Enter Building   — strike through window [m] 18f
  FX-W006   Electrical Discharge       — arc between objects [s] 24f loop

EXTREME WEATHER:
  FX-W007   Tornado Formation          — ground contact [xl] 120f
  FX-W008   Dust Storm Advance         — wall of dust [xl] 90f loop
  FX-W009   Blizzard Whiteout          — near-zero visibility [l] 120f loop
  FX-W010   Hailstorm                  — ground-level impact [m] 60f loop
  FX-W011   Dense Fog Roll             — low-lying advance [xl] 120f loop
  FX-W012   Earthquake Ground Crack    — surface split + debris [l] 60f

ATMOSPHERIC:
  FX-W013   Heat Shimmer/Haze          — road/desert thermal [m] 60f loop
  FX-W014   Light God Rays             — volumetric through dust [m] 90f loop
  FX-W015   Particle Dust (ambient)    — floating motes [m] 120f loop
  FX-W016   Snowfall (light)           — ambient, loopable [l] 120f loop
  FX-W017   Snowfall (heavy blizzard)  — wind-driven [l] 120f loop
  FX-W018   Falling Autumn Leaves      — wind-scattered [m] 120f loop
  FX-W019   Cherry Blossom Scatter     — gentle drift [m] 120f loop
  FX-W020   Pollen/Spore Cloud         — biological dispersal [m] 60f loop
  FX-W021   Volcanic Ash Fall          — heavy grey particles [l] 120f loop
  FX-W022   Radioactive Fallout Ash    — contamination snowfall [l] 120f loop
```

---

#### CATEGORY 6: ENERGY & SCI-FI — 32 effects

```
BEAMS & LASERS:
  FX-E001   Laser Pulse (single)    — directional bolt [m] 12f
  FX-E002   Laser Continuous        — sustained beam [m] 24f loop
  FX-E003   Laser Sweep             — rotating beam [m] 24f
  FX-E004   Phaser/Blaster Shot     — Hollywood sci-fi bolt [m] 12f
  FX-E005   Plasma Bolt             — slower, heavier shot [m] 18f
  FX-E006   Proton Stream           — particle beam [m] 36f loop
  FX-E007   Death Ray               — massive destructive beam [xl] 24f

PORTALS & FIELDS:
  FX-E008   Portal Open             — circular rift/wormhole [m] 36f
  FX-E009   Portal Active (loop)    — stable portal interior [m] 120f loop
  FX-E010   Portal Close            — rift sealing [m] 24f
  FX-E011   Force Field Impact      — shield hit ripple [m] 18f
  FX-E012   Force Field Shatter     — shield failure [m] 24f
  FX-E013   Energy Dome             — protective barrier [m] 60f loop
  FX-E014   Gravity Well            — space-time distortion [l] 36f

ELECTRICITY & POWER:
  FX-E015   Tesla Coil Arc          — electrical corona [s] 24f loop
  FX-E016   EMP Pulse Ring          — electromagnetic shock [xl] 18f
  FX-E017   Electricity Surge       — arcing through body/object [s] 24f loop
  FX-E018   Overload Explosion      — electrical equipment fail [s] 30f
  FX-E019   Hologram Glitch         — digital corruption [s] 18f loop
  FX-E020   Data Stream             — Matrix-style particle cascade [m] 90f loop
  FX-E021   Digital Disintegration  — pixel/voxel dissolve [m] 36f
  FX-E022   Teleportation Flash     — disappear/appear [s] 18f

IMPACT & ENERGY:
  FX-E023   Shockwave Ring (energy) — clean geometric pulse [xl] 18f
  FX-E024   Kinetic Impact Flash    — bright impact light [m] 9f
  FX-E025   Energy Sword/Blade      — sci-fi melee weapon [s] 24f loop
  FX-E026   Force Push/Pull         — object-displacement wave [m] 18f
  FX-E027   Photon Torpedo          — Star Trek-style [m] 18f
  FX-E028   Magic Spell (fire)      — arcane fire cast [m] 30f
  FX-E029   Magic Spell (ice)       — ice crystal formation [m] 30f
  FX-E030   Magic Spell (lightning) — arcane lightning [m] 24f
  FX-E031   Neon Trail              — moving light trail [m] 36f
  FX-E032   Aura/Energy Field       — character glow aura [s] 60f loop
```

---

#### CATEGORY 7: PRACTICAL & ENVIRONMENTAL — 18 effects

```
PRACTICAL:
  FX-R001   Confetti Burst          — celebration/party [m] 60f
  FX-R002   Balloon Pop             — instant burst + scraps [xs] 12f
  FX-R003   Champagne Pop           — cork + foam spray [xs] 18f
  FX-R004   Soap Bubbles            — floating cluster [s] 90f loop
  FX-R005   Cigarette Smoke         — exhale plume [xs] 30f loop
  FX-R006   Breath Vapour (cold)    — cold air exhale [xs] 12f

FIRE PRACTICAL:
  FX-R007   Match/Lighter Strike    — hand-scale ignition [xs] 12f
  FX-R008   Barbecue Flame-Up       — cooking grill burst [s] 18f
  FX-R009   Birthday Candles Blow   — collective extinguish [xs] 18f

NATURAL:
  FX-R010   Rock Slide (small)      — loose debris slide [m] 48f
  FX-R011   Avalanche               — snow mass down slope [xl] 120f
  FX-R012   Sinkhole Opening        — ground subsidence [l] 72f
  FX-R013   Tree Branch Snap        — impact break [s] 18f
  FX-R014   Beehive Burst           — swarm emergence [s] 36f

LIGHT:
  FX-R015   Practical Lens Flare    — camera glass flare [m] 12f loop
  FX-R016   Muzzle Flash Light Hit  — reactive light on subjects [s] 3f
  FX-R017   Studio Flash Pop        — photography flash [s] 3f
  FX-R018   Neon Sign Flicker       — practical electrical flicker [s] 30f loop
```

---

#### CATEGORY 8: CROWD & DESTRUCTION SIMULATION — 12 effects

```
FX-C001   Crowd Stampede          — aerial, fleeing crowd [xl] 90f
FX-C002   Riot/Crowd Surge        — horizontal crowd push [xl] 60f
FX-C003   Mass Evacuation         — dispersing crowd [xl] 120f
FX-C004   Building Evacuation     — exit flow [m] 90f
FX-C005   Stadium Panic           — tiered seating evacuation [xl] 90f
FX-C006   Zombie/Horde Advance    — shambling mass [xl] 120f loop
FX-C007   Army March              — military formation [xl] 90f loop
FX-C008   Cavalry Charge          — horse-mounted mass [xl] 60f
FX-C009   Crowd Celebration       — cheering, jumping [xl] 60f loop
FX-C010   Bar Fight Melee         — close-quarters chaos [m] 60f
FX-C011   Street Battle           — urban combat multiple agents [xl] 90f
FX-C012   Protest Line            — confrontation static [l] 60f loop
```

---

#### CATEGORY 9: TRANSFORMATION & HORROR — 18 effects

```
FX-T001   Thanos Snap Disintegrate — particle dissolve [m] 36f
FX-T002   Crystal/Ice Growth       — rapid formation [m] 48f
FX-T003   Vines/Tentacle Emerge    — surface breach [m] 48f
FX-T004   Shadow Creature Form     — dark figure coalescing [m] 36f
FX-T005   Stone Transformation     — solidification [m] 36f
FX-T006   Combustion Transform     — body-to-fire ignition [m] 24f
FX-T007   Morphic Warping          — surface liquify/shape-shift [m] 36f
FX-T008   Decay/Rot Time-Lapse     — biological decomposition [m] 60f
FX-T009   Mould/Fungal Growth      — organic spread [m] 48f
FX-T010   Wound Practical (gash)   — surface prosthetic reveal [xs] 18f
FX-T011   Head Explosion           — practical scale [s] 24f
FX-T012   Body Vaporisation        — sudden light-beam dissolve [m] 18f
FX-T013   Ghost Materialise        — translucent figure appear [m] 36f
FX-T014   Ghost Dematerialise      — figure fade through solid [m] 36f
FX-T015   Aging Transform          — face rapid aging [xs] 48f
FX-T016   Werewolf Transform       — humanoid to beast [m] 60f
FX-T017   Alien Facehugger Impact  — fast strike overlay [xs] 18f
FX-T018   Parasite Burst           — body surface movement [xs] 24f
```

---

### FX Library UI — ForgeVFX Browser Panel

```typescript
// src/renderer/components/vfx/FXLibraryBrowser.tsx

interface FXBrowserState {
  searchQuery: string
  selectedCategory: VFXCategory | 'all'
  sortBy: 'name' | 'duration' | 'scale' | 'popular' | 'recent'
  viewMode: 'grid' | 'list'
  previewHover: string | null       // effect id being previewed on hover
  selectedEffect: VFXEffect | null  // effect selected for placement
}

/* UI LAYOUT:
  Left column: Category tree (9 categories with counts)
  Main area: Effect grid
    - Each cell: animated .webp thumbnail (plays on hover)
    - Badge: duration, scale icon, blend mode icon
    - Click: selects effect, shows parameter panel
    - Double-click: opens full preview player
  Right panel (when effect selected):
    - Full-size preview with play/pause
    - Tags + description
    - Blend mode recommendation + override
    - Scale slider (0.1x → 10.0x)
    - Anchor point selector
    - Add to Timeline button (or drag-to-drop onto timeline)

SEARCH:
  Live fuzzy search across effect names + ai_prompt_match tags
  Voice search option: hold mic icon → describe the effect → results filter
  AI-powered: "something blowing up in a car park" → filters to FX-P002, FX-D031–D034
*/
```

### Applying Library Effects to Timeline

```
WORKFLOW A — Drag to Timeline:
  Drag effect thumbnail from browser onto any timeline clip
  → Effect placed as a new VFX layer on the clip (above, in compositor)
  → Auto-scales to match clip frame size
  → Blend mode auto-applied from effect.json
  → Parameters panel opens on right

WORKFLOW B — Paint on Frame:
  In effects mode, click 'Place Effect' button in browser
  → Click on any frame in the preview player
  → Effect anchor snaps to clicked point (for directional effects: impact_point)
  → Offset adjustable with handles

WORKFLOW C — Smart Placement:
  Drop effect onto clip, Forge Intelligence analyses the scene:
  - Detects surfaces (ground plane, walls, vehicles) for anchor placement
  - Suggests appropriate scale based on scene objects
  - Can track the effect to a moving object (e.g., explosion follows moving car)
  User confirms or adjusts placement.

ADJUSTMENT PARAMETERS (per placed effect):
  Position X/Y:       pixel offset from anchor point
  Scale:              0.1x → 10.0x (uniform or non-uniform)
  Rotation:           0° → 360°
  Opacity:            0.0 → 1.0, step: 0.001
  Blend Mode:         all compositor blend modes
  Timing Offset:      shift effect start time (frames)
  Speed:              0.1x → 3.0x (time remap the effect)
  Loop Toggle:        on/off (if effect supports looping)
  Loop Count:         1 → infinite
  Colour Tint:        multiply effect by a colour (e.g., green tint for chemical fire)
  Burn-in:            bake effect into clip (no longer adjustable — reduces file size)
```

---

## SYSTEM 2 — FORGE VFX AI GENERATOR
### Generate Any Custom Effect From a Text Prompt

### Core Concept

Instead of manually keyframing layers or writing shader code, you describe the effect you want in natural language — AI generates the code, animation, or overlay. ForgeVFX AI takes this further: it combines a smart prompt interpreter with a routed multi-model generation pipeline that picks the optimal 2026 model for each type of effect, then composites the result into the shot automatically.

### Architecture

```
FORGE VFX AI PIPELINE:

USER INPUT:
  1. Select a clip region (or full clip) on the timeline
  2. Optionally draw a mask on the frame (indicates where in frame the effect appears)
  3. Type or speak the effect description
  4. Select quality tier: Draft (fast/cheap) | Studio | Blockbuster

INTERPRETATION LAYER (claude-opus-4-8):
  - Understands the raw description (even vague: "make it explode dramatically")
  - Classifies the effect type into one of 4 generation strategies (below)
  - Expands the prompt with cinematography/physics details for best generation
  - Selects the optimal model from the 2026 farm
  - Estimates credit cost before dispatching
  - Returns: { strategy, model, expanded_prompt, estimated_cost, warnings[] }

HIDDEN FROM USER: All of the above. User sees "Forge is generating your effect..."

GENERATION STRATEGIES:
  Strategy A: ISOLATED GENERATION + COMPOSITE
  Strategy B: VIDEO-TO-VIDEO IN-CONTEXT
  Strategy C: FRAME-THEN-ANIMATE
  Strategy D: PROCEDURAL HYBRID
```

---

### Generation Strategy A — Isolated Generation + Composite

**Best for:** Fire, smoke, explosions, energy effects, particles, weather, atmospheric

```
HOW IT WORKS:
  1. Effect is generated in ISOLATION on a pure black background
     (no scene content in the generation — just the effect itself)
  2. Effect clip is composited over the original footage using:
     - Add blend mode (fire, light, energy, sparks)
     - Screen blend mode (smoke, atmospheric, particles)
     - Normal with alpha (debris, solid objects)
  3. AI Lighting Match: effect is colour-graded to match ambient light of scene
  4. Motion Track: if a moving subject is designated as anchor, effect tracks it

WHY THIS WORKS:
  Add/Screen blend modes on black-background effects are INVISIBLE on the black areas —
  only the bright effect pixels composite through. This is exactly how practical fire
  and pyro elements have been composited in Hollywood for decades.
  AI generation just replaces the practical element with generated footage.

MODEL ROUTING FOR STRATEGY A:
  Fire / smoke / explosion      → Veo 3.1 Standard (physics benchmark leader)
  Energy beams / sci-fi         → PixVerse V5.5 (stylized effects)
  Atmospheric / particles       → Wan 2.6 (efficient, good for ambient)
  Fluid dynamics (water, blood) → Veo 3.1 Standard or Sora 2 (physics)
  Draft tier                    → LTX-2.3 or Wan 2.6 (fast + cheap)

PROMPT TEMPLATE (Strategy A):
  Expanded by claude-opus-4-8 into:
  "Isolated [effect type] on pure black background, no environment, no subjects.
   [Physics description]. [Duration]s. Cinematic quality. Photorealistic.
   [Scale context]. Alpha channel compositable."
```

---

### Generation Strategy B — Video-to-Video In-Context

**Best for:** Effects that must interact with scene content — crash deformation, surface fire on specific objects, bullet holes in specific walls, transformations, glass shattering

```
HOW IT WORKS:
  1. The ACTUAL clip (or the relevant frames) is sent as the base video
  2. The masked region shows where the effect should appear
  3. A V2V model receives: base video + mask + effect prompt
  4. Model generates the effect WITHIN the existing scene, with correct perspective,
     lighting, and interaction with existing elements
  5. The V2V output replaces the original frames

WHY THIS WORKS:
  The model sees the actual scene — so a car crash crumples the REAL car in the clip,
  a window shattering breaks the REAL window geometry, fire on a table ignites the
  ACTUAL table surface. The effect is contextually accurate, not floating over the scene.

MODEL ROUTING FOR STRATEGY B:
  Surface interaction effects     → Runway Gen-4.5 (V2V, scene consistency leader)
  Complex physics + real scene    → Seedance 2.0 (V2V repair specialist, multi-ref)
  Character transformation        → APEX (HappyHorse 1.0, character consistency)
  Draft V2V                       → Runway Gen-4 Turbo (faster, cheaper)

PROMPT TEMPLATE (Strategy B):
  claude-opus-4-8 constructs:
  "The [masked region] of this video [undergoes effect description].
   Maintain perfect consistency with surrounding scene elements.
   [Physics constraints]. [Material behaviour]. [Timing].
   The effect must look like it was captured in-camera, not composited."
```

---

### Generation Strategy C — Frame-Then-Animate

**Best for:** Effects that originate from a still or nearly-still element — an object that explodes, a specific person who bursts into flames, a sign that glows and pulses

```
HOW IT WORKS:
  1. Extract the key frame from the clip (or user pins a specific frame)
  2. Generate an IMAGE of the mid-effect state (explosion mid-burst, glass mid-shatter)
     using an image generation model
  3. Use that image as the first frame anchor for video generation
  4. Generate forward (effect in progress) and sometimes reverse (pre-effect)
  5. Blend generated sequence into original clip at correct time point

WHY THIS WORKS:
  Gives the model an exact scene-accurate visual reference for the peak of the effect —
  ensures it matches the exact geometry, lighting, and composition of the original shot.

MODEL ROUTING FOR STRATEGY C:
  Image generation        → Stable Diffusion 3.5 or SDXL (fast, accurate)
  Animation from image    → Seedance 2.0 (I2V, best character/scene fidelity)
  Continuation backward   → LTX-2.3 (for pre-effect build-up frames)
```

---

### Generation Strategy D — Procedural Hybrid

**Best for:** Repeated or looping effects, effects that need exact timing, effects where user wants full parameter control (scale, direction, duration)

```
HOW IT WORKS:
  1. claude-opus-4-8 analyses the prompt and builds a parameter set
  2. System checks the FX Library for the closest matching bundled effect
  3. If library match score > 85%: uses the library effect with AI-adjusted parameters
  4. If no match: generates new effect isolated (Strategy A) and saves to user library
  5. User-defined parameters always override AI parameters

WHY THIS WORKS:
  Fastest path to a result — if the user needs "a glass window shattering" and
  FX-D001 is a 95% match, there's no generation cost — just parameter adjustment.
  Only pays generation cost for truly novel custom effects.

LIBRARY MATCH SCORING:
  claude-opus-4-8 compares the prompt against all ai_prompt_match tags
  Returns: best_match_id, match_score (0.0–1.0), parameter_overrides
  Threshold: 0.85 = use library effect; <0.85 = generate new
```

---

### ForgeVFX AI Panel — UI Specification

```typescript
// src/renderer/components/vfx/ForgeVFXAIPanel.tsx

/*
PANEL LAYOUT:
  ┌─────────────────────────────────────────────────────────────────┐
  │  ⚡ FORGE VFX AI                              [Draft] [Studio] [Block] │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                 │
  │  [Canvas: current frame with mask draw tools]                   │
  │                                                                 │
  │  Draw mask: ○ Brush  □ Rectangle  ◇ Polygon  ◉ None (full frame)│
  │                                                                 │
  ├─────────────────────────────────────────────────────────────────┤
  │  Describe the effect:                                           │
  │  ┌───────────────────────────────────────────────────────────┐  │
  │  │ A massive explosion from inside the building, shockwave   │  │
  │  │ blowing out the windows, followed by thick black smoke... │  │
  │  └───────────────────────────────────────────────────────────┘  │
  │  [🎤 Voice Input]                     [↑ Recent Prompts ▾]      │
  │                                                                 │
  │  ┌─── Forge Intelligence is planning your effect... ──────────┐ │
  │  │  Strategy: Isolated Generation + Composite                 │ │
  │  │  Estimated: 24 Forge Credits  |  ~45 seconds               │ │
  │  │  ⚠ Large scale detected — will composite on Add mode       │ │
  │  └────────────────────────────────────────────────────────────┘ │
  │                                                                 │
  │  [  GENERATE EFFECT  ]                    [Advanced Options ▾]  │
  ├─────────────────────────────────────────────────────────────────┤
  │  ACTIVE EFFECTS ON THIS CLIP:                                   │
  │  ◉ AI Explosion Overlay        [Params] [Track] [×]            │
  │  ◉ Black Smoke Plume (Library) [Params] [Track] [×]            │
  └─────────────────────────────────────────────────────────────────┘

ADVANCED OPTIONS (expandable):
  Generation strategy override: Auto / A (Isolated) / B (V2V) / C (Frame-first) / D (Library)
  Reference frame: pin specific frame as scene reference for generation
  Composite blend mode override: Add / Screen / Normal / Overlay / Hard Light
  Lock to object: track effect to moving subject
  Duration multiplier: match to X frames of clip
  Loop after generation: yes / no / loop count
  Save to My Effects Library: yes / no (save for reuse in future projects)
*/
```

### AI Prompt Expansion — Forge Intelligence

```
claude-opus-4-8 SYSTEM PROMPT for VFX interpretation (HIDDEN):

You are the VFX supervisor for Cinematic Forge. Your job is to analyse
an effect description from a user and translate it into a precise, 
photorealistic generation prompt that will produce the best possible
visual effect.

RULES:
1. Always classify the effect into one of 4 strategies (A/B/C/D)
2. Expand vague descriptions into specific physical behaviour details
3. Add cinematography language (camera angle, light direction, scale reference)
4. Include material science (glass fragments at this scale do X; pyro at this
   temperature does Y) to improve physical accuracy
5. NEVER include model names in any output visible to the user
6. Always include: timing (Xs from impact to peak), colour temperature, 
   scale reference object
7. If effect could cause harm to real people (weapon tutorials, etc.) — refuse
   and suggest a safe creative alternative

OUTPUT FORMAT:
{
  strategy: 'A' | 'B' | 'C' | 'D',
  model_id: string,         // INTERNAL ONLY — never shown to user
  user_facing_plan: string, // shown in UI before generation
  generation_prompt: string,
  blend_mode: BlendMode,
  estimated_credits: number,
  estimated_seconds: number,
  warnings: string[]
}

EXAMPLE INPUT: "make the car blow up when it hits the wall"
EXAMPLE OUTPUT:
{
  strategy: 'B',                        // V2V — crumple must match the actual car
  model_id: 'runway_gen_4_5',           // INTERNAL
  user_facing_plan: "Forge will integrate a crash deformation + explosion effect
                     into your scene, matching the car's exact shape and position.",
  generation_prompt: "The vehicle undergoes catastrophic impact with the concrete
    barrier. Front crumple zone collapses first (40ms), triggering fuel ignition
    (120ms). Rolling fireball expands from the engine bay. Glass shatters outward
    simultaneously. Debris (safety glass pebbles, plastic trim, metal shards)
    radiates from impact point at 15–45m/s. Secondary black smoke plume rises
    post-ignition. Scene lighting: single practical source from camera left.
    Maintain perfect visual continuity with surrounding scene.",
  blend_mode: 'normal',
  estimated_credits: 18,
  estimated_seconds: 35,
  warnings: []
}
```

### Post-Generation Pipeline

```
AFTER GENERATION COMPLETES:
  1. Download generated clip to local cache
  2. Quality inspection (Claude Vision): 
     - Does the effect match the description?
     - Does it blend with the scene?
     - Are there artifacting issues (floating edges, inconsistent lighting)?
     Score 0–10. < 7 → auto-retry with adjusted prompt or alternate model.
  3. Auto-composite:
     - Strategy A: composite using recommended blend mode
     - Strategy B: replace original frames with generated frames
     - Strategy C: splice generated sequence at correct time point
  4. Motion tracking (if anchor object detected):
     - AI tracks designated anchor through effect duration
     - Effect translation matches anchor motion
  5. Colour match:
     - Sample ambient colour temperature from surrounding scene
     - Apply subtle colour correction to generated effect
     - Reduces artificial "pasted-on" look
  6. Present to user:
     - Before/after toggle in preview player
     - Parameters panel for adjustment
     - Accept / Retry / Adjust buttons

RETRY OPTIONS:
  "Retry with more intensity"  → increases scale/energy of the prompt
  "Retry more subtle"          → reduces scale in the prompt
  "Retry different style"      → changes visual approach (e.g., realistic → cinematic)
  "Adjust and retry"           → user edits the expanded prompt directly
  "Use library match instead"  → falls back to closest library effect
```

### User-Created Effects Library

```
SAVE TO MY EFFECTS:
  After any successful AI generation, user can save the result:
  - Adds to personal library (stored locally + synced to ForgeFlow cloud)
  - Assign category, name, tags
  - Mark as 'Favourite' for quick access
  - All saved effects appear in the FX Library Browser alongside bundled effects
  - Share with team (sends to ForgeFlow team workspace)
  
MY EFFECTS PANEL:
  Tab in FX Library Browser: "My Library" | "Shared with Team"
  All user-created effects shown with their original prompt as description
  Can re-apply to any clip with one click
  Can regenerate (uses saved prompt + parameters)
```

---

## FORGE VFX PANEL — INTEGRATION WITH NODE COMPOSITOR

Every applied effect (both library and AI-generated) creates a VFX layer in the node compositor:

```
COMPOSITOR NODE STRUCTURE (per clip with effects):
  Input Clip
       ↓
  [VFX Layer 1: Explosion] ← FX-P004 library effect
       ↓                      blend: add, scale: 1.2x, offset: +12f
  [VFX Layer 2: Smoke Plume] ← FX-P023 library effect
       ↓                       blend: screen, scale: 1.8x, loop
  [VFX Layer 3: AI Effect] ← AI Generated: "sparks raining through broken window"
       ↓                     blend: add, auto-composited
  [Colour Match Node]      ← normalises all effects to scene colour temperature
       ↓
  Output

USER ACCESS:
  - Each layer is editable in the compositor (double-click node → full parameters)
  - Layers can be reordered (drag in compositor)
  - Any layer can be solo'd (see only that effect)
  - Any layer can be temporarily disabled (eye icon)
  - All effects are non-destructive until 'Burn In' is selected
```

---

## SPRINT ADDENDUM FOR CURSOR — VFX EFFECTS

### SPRINT C-VFX-1: Forge FX Library Browser & Bundled Effects

```
Goal: Complete FX library UI + all 200+ bundled effects loading, playing, and compositing.

Files to create:
  src/renderer/components/vfx/
    FXLibraryBrowser.tsx         — main panel: category tree + grid + preview
    FXEffectCard.tsx             — grid cell: animated thumbnail + metadata badge
    FXEffectPreview.tsx          — full preview player for selected effect
    FXParametersPanel.tsx        — parameters for a placed effect
    FXActiveEffectsList.tsx      — list of effects applied to current clip
    FXCategoryTree.tsx           — left column: 9 categories with counts

  src/main/vfx/
    fxLibrary.ts                 — load effect metadata from /resources/vfx/
    fxCompositor.ts              — apply FX layer to clip in FFmpeg compositing pipeline
    fxTracker.ts                 — attach effect anchor to moving object tracking
    fxColourMatch.ts             — match effect colour temperature to scene

  resources/vfx/                 — 200+ effects (ProRes 4444 + proxy + metadata JSON)
                                   Generate/source all effects before this sprint ships

Acceptance:
  - All 9 categories present with correct effect counts
  - Hover on any card plays animated preview within 300ms
  - Drag effect to timeline clip → effect appears composited in preview within 2s
  - Blend mode applied correctly (fire on Add = no black border visible)
  - Scale, position, timing, opacity all adjustable and live in preview
  - Loop effects loop seamlessly
```

### SPRINT C-VFX-2: Forge VFX AI Generator

```
Goal: Full AI prompt-to-effect pipeline with all 4 strategies, quality inspection,
      auto-compositing, and user library.

Files to create:
  src/renderer/components/vfx/
    ForgeVFXAIPanel.tsx          — main AI generator panel (see UI spec above)
    FXMaskCanvas.tsx             — draw mask on frame (brush/rect/polygon tools)
    FXGenerationProgress.tsx     — generation progress + quality inspection display
    FXResultComparison.tsx       — before/after toggle after generation
    FXUserLibrary.tsx            — personal saved effects browser

  src/main/vfx/
    aiVFXRouter.ts               — INTELLIGENCE: claude-opus-4-8 prompt interpreter
                                   (HIDDEN — all model names stay server-side)
    aiVFXStrategies.ts           — 4 strategies (isolated/V2V/frame-first/hybrid)
    aiVFXQuality.ts              — quality inspection per generated result
    aiVFXAutoComposite.ts        — post-generation auto-composite pipeline
    aiVFXColourMatch.ts          — match generated effect to scene lighting
    aiVFXMotionTrack.ts          — track effect to anchor object
    aiVFXUserLibrary.ts          — save/load user-created effects

IPC channels:
  'vfx:generate' (prompt, clip_region, mask, quality_tier) → JobID
  'vfx:generation-progress' (jobId) → { stage, percent, message }
  'vfx:generation-complete' (jobId) → { output_path, blend_mode, quality_score }
  'vfx:library-save' (effect_data) → effectId
  'vfx:library-load' () → VFXEffect[]

Acceptance:
  - Type "a car exploding" → system generates, composites, and shows result in <60s (Studio tier)
  - Strategy A: fire effect on black bg → composited with Add mode, no black visible
  - Strategy B: V2V prompt "glass window shatters when object hits it" → 
    window IN the actual clip shatters correctly, not a floating overlay
  - Strategy C: user pins a specific frame → generation anchored to that frame exactly
  - Strategy D: "glass shattering" → matches FX-D001 at 92% → uses library, no gen cost
  - Quality score <7 → auto-retry occurs without user action
  - Colour match: generated effect adapts to warm tungsten scene vs cool daylight scene
  - Save to My Effects: saved effect re-applies correctly to a different clip
  - Voice input: spoken description creates same result as typed description
  - Before/after toggle works in preview player
```

---

## UPDATED CURSOR FEED ORDER

```
17. CINEMA_V3_CURSOR_PROMPT.md
18. CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md
19. CINEMA_V3_VFX_EFFECTS_ADDENDUM.md   ← THIS DOCUMENT (position 19)

Sprint insertion:
  C-VFX-1 inserts after Sprint 20 (existing particles/sky sprint) as Sprint 20-A
  C-VFX-2 inserts after C-VFX-1 as Sprint 20-B
  All subsequent sprints push back 2 positions.
  
Total sprint count: 50 (48 + 2 new VFX sprints)
```

---

## DEFINITION OF DONE — VFX EFFECTS SYSTEM

**FX Library:**
- [ ] All 200+ effects present in /resources/vfx/ with metadata JSON
- [ ] All effects play correctly in browser preview (animated .webp thumbnails)
- [ ] All 9 categories populated with correct effect counts
- [ ] Drag-to-timeline composites correctly in preview within 2s
- [ ] Add blend mode: fire effect — zero black border visible against dark scene
- [ ] Screen blend mode: smoke — transparent in dark areas, opaque in bright areas
- [ ] Scale, position, timing, opacity, blend mode all adjustable live
- [ ] Loop effects loop frame-perfectly (no jump at loop point)
- [ ] Smart placement: detects ground plane and snaps effect anchor correctly

**AI Generator:**
- [ ] Any explosion/fire prompt generates a plausible isolated effect (Strategy A)
- [ ] V2V prompt correctly modifies actual scene content, not floating overlay (Strategy B)
- [ ] Frame-anchor generation matches the pinned frame composition (Strategy C)
- [ ] Library match >85%: uses library effect, zero generation cost (Strategy D)
- [ ] Quality inspection: auto-retry fires when score <7, no manual trigger needed
- [ ] Colour match: generated fire in warm scene ≠ same fire in cool scene (visibly different)
- [ ] Motion track: effect anchor correctly follows a tracked moving car for 5s clip
- [ ] Voice input produces same generation quality as typed prompt
- [ ] User library: save, recall, re-apply to different clip — all work correctly
- [ ] Zero model names exposed in any user-facing string, tooltip, or log

---

*Cinematic Forge V3 — VFX Effects System Addendum*
*Addendum Version: 1.0 | May 2026*
*2 Additional Sprints (50 total) | Requires: Cursor Agent with claude-opus-4-8*
