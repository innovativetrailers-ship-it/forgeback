# CINEMATIC FORGE V3 — AUDIO & COLOUR PRECISION ADDENDUM
## `CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md`
### Extreme Fine-Tuning: Professional Mix Mastering + Surgical Colour Science
### Feeds AFTER `CINEMA_V3_CURSOR_PROMPT.md` — Supersedes and Expands Groups B and D

---

> **THIS DOCUMENT REPLACES the D07 (EQ) entry in V3 Group D and expands Group B**
> with a complete professional-grade audio mastering suite and a surgical
> micro-precision colour panel. Nothing ships as a stub. Every control must work.

---

## PART 1 — FORGE SPECTRUM EQ
### "Surgical Precision to Analog Warmth — in a Single Panel"

The Forge Spectrum EQ replaces the 8-band EQ specified in Sprint 21.
It is a **20-band, multi-mode professional equalizer** that covers every use case
from a sub-bass rumble notch to a 2026 broadcast master curve.

---

### 1.1 — Core EQ Engine

```typescript
// src/renderer/components/audio/eq/ForgeSpectrumEQ.tsx

interface EQBand {
  id: string
  enabled: boolean
  frequency: number      // Hz — range: 16Hz → 24,000Hz — step: 1Hz
  gain: number           // dB — range: -30.0 → +30.0 — step: 0.01dB
  q: number              // range: 0.10 → 30.00 — step: 0.01
  type: EQBandType
  dynamicEnabled: boolean
  dynamicThreshold: number   // dBFS — range: -60 → 0
  dynamicRatio: number       // range: 1.0 → 20.0
  dynamicAttack: number      // ms: 0.1 → 300
  dynamicRelease: number     // ms: 1 → 2000
  dynamicLookahead: number   // ms: 0 → 100
  msChannel: 'both' | 'mid' | 'side'  // M/S routing
  analogCharacter: AnalogMode | null
}

type EQBandType =
  | 'bell'          // Standard parametric (boost/cut around center frequency)
  | 'high_shelf'    // Shelving boost/cut above frequency
  | 'low_shelf'     // Shelving boost/cut below frequency
  | 'high_pass'     // Rolls off below frequency (HP filter, 6/12/18/24/48 dB/oct)
  | 'low_pass'      // Rolls off above frequency (LP filter, 6/12/18/24/48 dB/oct)
  | 'notch'         // Deep narrow cut (infinite Q option)
  | 'bandpass'      // Pass only the frequency band
  | 'tilt'          // Tilted shelf (brightens or darkens overall balance)
  | 'baxandall'     // Broad musical shelves — mastering character
  | 'pultec_lf'     // Simultaneous boost+cut at same frequency (Pultec trick)
  | 'allpass'       // Phase rotation at frequency (no gain change)

type AnalogMode =
  | 'neve_1073'     // Warm, forward, slightly aggressive
  | 'neve_1081'     // Tight, punchy, detailed
  | 'ssl_4000e'     // Clean, fast, transparent-aggressive
  | 'ssl_g_series'  // Smooth, polished, broadcast
  | 'pultec_eqp1'   // Vintage transformer color, musical peaks
  | 'sontec_mep250' // Mastering-grade transparency
  | 'api_550'       // Stepped, proportional Q, aggressive
  | 'manley_massive_passive'  // Tube character, air and weight

type PhaseMode =
  | 'minimum'       // Standard IIR — small latency, natural phase shifts
  | 'linear'        // FIR — zero phase shift, adds latency (adjustable up to 256ms)
  | 'natural'       // Between minimum and linear — preserves some analog feel
```

### 1.2 — Band Configuration: 20 Bands

```
PRESET BAND LAYOUTS (user can modify any):

DEFAULT 20-BAND LAYOUT:
  Band 1:  16 Hz    HP filter   (sub rumble removal)
  Band 2:  30 Hz    Bell        (sub-bass body)
  Band 3:  60 Hz    Bell        (kick/bass fundamental)
  Band 4:  90 Hz    Bell        (bass warmth)
  Band 5:  120 Hz   Bell        (upper bass)
  Band 6:  200 Hz   Bell        (low-mid mud zone)
  Band 7:  300 Hz   Bell        (boxy resonance zone)
  Band 8:  500 Hz   Bell        (low-mid presence)
  Band 9:  800 Hz   Bell        (nasal/honky zone)
  Band 10: 1.2 kHz  Bell        (mid presence)
  Band 11: 1.8 kHz  Bell        (upper-mid detail)
  Band 12: 2.5 kHz  Bell        (attack/bite)
  Band 13: 3.5 kHz  Bell        (harsh/sibilance zone)
  Band 14: 5 kHz    Bell        (presence/edge)
  Band 15: 7 kHz    Bell        (upper presence)
  Band 16: 9 kHz    Bell        (definition/air boundary)
  Band 17: 12 kHz   Bell        (air/sparkle)
  Band 18: 15 kHz   High shelf  (overall air)
  Band 19: 18 kHz   High shelf  (ultra high extension)
  Band 20: 22 kHz   LP filter   (aliasing/digital ceiling)

PRESET: 8-BAND STANDARD  — bands 1,3,6,8,10,14,17,20
PRESET: 10-BAND MIX      — bands 1,2,4,6,8,11,14,16,18,20
PRESET: 15-BAND POST     — bands 1,2,3,5,7,8,9,11,13,15,17,18,19,20 +one free
PRESET: 20-BAND SURGICAL — all 20 bands, fine-tuning mode
```

### 1.3 — EQ Modes (4 Modes on Single Toggle)

**MODE 1: STANDARD (Minimum Phase IIR)**
- All 20 bands active
- Classical phase response (natural, analog-accurate)
- <1ms latency
- Use for: tracking, monitoring, most mixing situations

**MODE 2: LINEAR PHASE (FIR)**
- Zero phase shift at all frequencies
- Adjustable latency compensation (32 / 64 / 128 / 256 samples)
- Eliminates pre-ringing at high Q settings
- Use for: mastering, critical listening, bus processing

**MODE 3: DYNAMIC EQ**
- Each band becomes a frequency-selective compressor
- Per-band: Threshold / Ratio / Attack / Release / Lookahead (0–100ms)
- Display: gain reduction meters per band overlay on frequency plot
- Sidechain: internal (default) or external sidechain input
- Use for: de-essing specific ranges, controlling room resonances, taming harshness dynamically

**MODE 4: ANALOG CHARACTER**
- Each band can be assigned an analog model (Neve, SSL, Pultec, etc.)
- Subtle harmonic saturation + characteristic filter curves
- Each model adds transformer resonance / tube coloration to the band
- Use for: adding warmth, vintage character, professional console sound

### 1.4 — M/S (Mid-Side) Processing

```
M/S MODES:
  Stereo       — all bands process L+R identically (default)
  Mid Only     — process only the centre/mono information
  Side Only    — process only the stereo difference information
  Independent  — each band has its own M/S selector (most powerful)

USE CASES:
  Boost side 12kHz → adds air and width without muddying the centre
  Cut side 200Hz → tightens low end in mono (removes muddy side bleed)
  Boost mid 2–5kHz → adds presence and cut-through
  Narrow side below 100Hz → mono-compatible bass (streaming standard)
```

### 1.5 — Spectrum Analyser Display

```
DISPLAY MODES:
  Real-time FFT       — current frame, 16,384 point resolution
  Peak Hold           — maximum seen, decay selectable (0.5s / 2s / 5s / infinite)
  Time-averaged       — rolling average (0.1s / 0.5s / 2s)
  Pre/Post overlay    — shows input spectrum AND output simultaneously (blue/white)
  Reference track     — overlay spectrum of loaded reference track (pink)

DISPLAY OPTIONS:
  dB scale:     -120 → 0 dBFS (full), -80 → 0 (standard), -60 → 0 (mix view)
  Frequency:    Linear / Log (default log; ISO third-octave grid option)
  Smoothing:    1/12 oct / 1/6 oct / 1/3 oct / 1/1 oct
  Resolution:   2048 / 4096 / 8192 / 16384 points
  Colour map:   Classic (green), Heat (red-yellow), Ghost (white), Band-coloured
```

### 1.6 — Phase Response Display

```
Phase Response panel (toggle — shows below EQ curve):
  Displays phase shift in degrees (-180° → +180°) vs frequency
  Updates in real time as bands are adjusted
  Linear phase mode: flat line at 0°
  Minimum phase: shows natural phase rotation
  Per-band phase contribution highlighted when band is selected
```

### 1.7 — Match EQ

```
MATCH EQ WORKFLOW:
  1. Load a reference audio file (WAV/MP3/AIFF) or capture live from any input
  2. Click "Analyse Reference" → FFT analysis of reference material
  3. Click "Match" → Forge Intelligence calculates correction curve
     (Corrects from current material to reference spectrum)
  4. Curve applied across all 20 bands with configurable smoothing
  5. Match strength slider (0–100%) — blend between original and matched curve
  6. User can then fine-tune individual bands after matching

INTELLIGENT MATCHING:
  Uses claude-opus-4-8 to interpret spectral differences:
  - Identifies: "Reference has more air above 12kHz — boosting shelf 15kHz by +1.8dB"
  - Flags problematic corrections: "Matching requires +8dB at 3kHz — may cause harshness"
  - Suggests alternative approach when direct match would degrade quality
  
HIDDEN FROM USER: All AI calls. User sees "Analysing spectrum..." then the correction.
```

### 1.8 — Delta Monitoring

```
DELTA (Δ) button: hear ONLY what the EQ is adding or removing.
  → Press Δ: output = (processed signal) - (input signal)
  → You hear: exactly what the EQ is doing, in isolation
  → Use: verify you're boosting the RIGHT frequency; hear a resonance before cutting it
  → A/B compare: toggle between Delta and full signal quickly
```

### 1.9 — Precision Input Controls

Every band value is editable via:
- Drag on spectrum graph (primary interaction — handles are draggable)
- Click band value → type exact number (e.g., "2.534kHz", "+1.75dB", "Q:4.20")
- Scroll wheel over handle (fine: 0.1dB / coarse: 1dB per scroll)
- Double-click value → reset to default
- Right-click handle → menu: Solo Band, Reset Band, Copy Band, Bypass Band
- Alt+drag frequency handle: moves frequency only (not gain)
- Shift+drag gain handle: locks Q while adjusting gain

---

## PART 2 — FORGE MASTER SUITE
### "A Complete Professional Mastering Chain — Built In"

The Forge Master Suite is a dedicated **Mastering workspace tab** within the Audio page.
It is a 9-stage serial mastering chain with the correct signal-flow order from research.

```
SIGNAL FLOW ORDER (research-confirmed):
  Input Gain → [1] Corrective EQ → [2] Bus Compressor (glue) →
  [3] Multiband Dynamics → [4] Tape/Tube Saturation → [5] Creative EQ →
  [6] Stereo Imager → [7] Soft Clipper → [8] True Peak Limiter →
  [9] Dither → Output
```

### 2.1 — Stage 1: Corrective EQ (Forge Spectrum EQ, Linear Phase Mode)

Dedicated instance of the Forge Spectrum EQ (Section 1) in Linear Phase mode.
Purpose: fix tonal balance problems without adding character.

### 2.2 — Stage 2: Bus Compressor (Glue)

```typescript
interface BusCompressor {
  mode: 'vca' | 'optical' | 'fet' | 'variable_mu'
  analogModel: 'ssl_g_bus' | 'neve_33609' | 'api_2500' | 'fairchild_670' | 'clean'
  threshold: number    // dBFS: -40 → 0, step 0.1
  ratio: number        // 1.1:1 → 20:1 (mastering range: 1.5:1 → 2.5:1)
  attack: number       // ms: 0.1 → 300 (typical mastering: 10–30ms)
  release: number      // ms: 1 → 5000 (or 'auto' — program-dependent)
  knee: number         // dB: 0 (hard) → 24 (very soft)
  makeupGain: number   // dB: 0 → 24
  sidechain: {
    highpass: number   // Hz: 20 → 500 (filter side-chain to avoid bass pumping)
    lookahead: number  // ms: 0 → 20
    externalInput: string | null
  }
  parallel: number     // % wet/dry blend (0 = serial, 100 = full parallel)
  gainReductionMeter: true  // always visible
}

ANALOG MODEL CHARACTERS:
  SSL G-Bus:          Fast, punchy, adds cohesion — the "glue" standard
  Neve 33609:         Smooth, musical, adds warmth and depth
  API 2500:           Aggressive, tight, forward — adds density
  Fairchild 670:      Vintage variable-μ — slow, smooth, extremely musical
  Clean:              Transparent digital — no character, pure dynamics control
```

### 2.3 — Stage 3: Multiband Dynamics (6 Bands)

```typescript
interface MultibandBand {
  id: string
  name: string                     // 'Sub', 'Bass', 'Low-Mid', 'Mid', 'High-Mid', 'Air'
  lowFreq: number                  // crossover point (Hz)
  highFreq: number
  mode: 'compress' | 'expand' | 'gate' | 'de_ess' | 'transient_shape'
  threshold: number                // dBFS
  ratio: number                    // 1:1 → 20:1
  attack: number                   // ms
  release: number                  // ms
  knee: number                     // dB
  makeupGain: number               // dB
  solo: boolean                    // listen to this band only
  bypass: boolean
  gainReduction: number            // live read-out
  outputLevel: number              // live read-out
}

DEFAULT 6-BAND SPLIT:
  Sub:       20Hz → 60Hz       (sub bass, LFE control)
  Bass:      60Hz → 180Hz      (bass body, kick fundamental)
  Low-Mid:   180Hz → 600Hz     (warmth, mud zone)
  Mid:       600Hz → 2.5kHz    (presence, voice, most musical content)
  High-Mid:  2.5kHz → 8kHz     (air boundary, harshness, definition)
  Air:       8kHz → 22kHz      (brilliance, sparkle, space)

CROSSOVER TYPES:
  Butterworth 4th order (classic)
  Linkwitz-Riley 4th order (no crossover level sum)
  Linkwitz-Riley 8th order (steeper, more isolation)
  FIR Linear Phase (no phase shift at crossovers — adds latency)
```

### 2.4 — Stage 4: Tape & Tube Saturation

```typescript
interface SaturationStage {
  type: 'tape' | 'tube' | 'transistor' | 'transformer'
  tapeModel: 'ampex_atr102' | 'studer_a820' | 'otari_mtr90' | 'quantegy_456' | null
  tubeModel: 'manley_massive_passive' | 'la2a_tube' | 'pultec_passive' | null
  driveLevel: number         // dB input drive: -12 → +24 (higher = more saturation)
  outputLevel: number        // dB output trim: -12 → +12 (compensate drive level)
  mix: number                // 0–100% wet/dry (parallel saturation)
  tapeSpeed: 'ips_7_5' | 'ips_15' | 'ips_30' | null
  biasLevel: 'under' | 'nominal' | 'over' | null   // tape bias (under = bright/forward)
  loFreqBoost: number        // dB: low-end boost from tape head proximity
  hiFreqRolloff: number      // kHz: high-end tape rolloff point
  harmonicProfile: {
    h2: number               // % 2nd harmonic (warmth)
    h3: number               // % 3rd harmonic (grit/edge)
    h4_h5: number            // % higher order (bite/complexity)
  }
  crosstalkAmount: number    // % (simulates inter-channel bleed — adds stereo glue)
}
```

### 2.5 — Stage 5: Creative/Tonal EQ

Second Forge Spectrum EQ instance (Minimum Phase or Analog Character mode).
Purpose: add tonal colour, sparkle, warmth, character — after dynamics are controlled.

### 2.6 — Stage 6: Stereo Imager

```typescript
interface StereoImager {
  // PER-BAND stereo width (6 bands matching multiband crossovers)
  bands: Array<{
    lowFreq: number
    highFreq: number
    width: number           // 0% = mono, 100% = original, >100% = wider, up to 200%
    bypass: boolean
    solo: boolean           // listen to this band only for checking
  }>

  // Global width trim
  globalWidth: number       // 0–200%
  
  // M/S encoder/decoder
  msMode: boolean           // convert L/R → M/S processing
  midLevel: number          // dB: -12 → +12 (boost/cut centre)
  sideLevel: number         // dB: -12 → +12 (boost/cut sides)
  
  // Mono compatibility
  monoBelow: number         // Hz: frequencies below this are fully mono (common: 80–120Hz)
  monoCheck: boolean        // live button: collapses to mono for A/B check
  
  // Correlation meter
  phaseCorrelation: number  // live: -1.0 (out of phase) → +1.0 (perfectly mono)
  correlationWarning: boolean // alert if correlation drops below -0.2
  
  // Haas effect spreader (subtle)
  haasDelay: number         // ms: 0 → 35 (delays one channel for perceived width)
}
```

### 2.7 — Stage 7: Soft Clipper

```typescript
interface SoftClipper {
  enabled: boolean
  threshold: number         // dBFS: -3 → 0 (where clipping begins)
  character: 'soft' | 'medium' | 'hard' | 'tube' | 'tape'
  oversample: 2 | 4 | 8 | 16 | 32   // oversampling (higher = less aliasing, more CPU)
  // Purpose: transparently reduce transient peaks before limiter, allowing louder master
  // Benefit: limiter sees less peak energy → less limiting → more open, dynamic sound
  gainReductionMeter: number  // live read-out of clipping activity
}
```

### 2.8 — Stage 8: True Peak Limiter

```typescript
interface TruePeakLimiter {
  // Ceiling
  ceilingDBFS: number       // typically: -0.3 dBFS (broadcast), -1.0 (streaming safe)
  truePeakCeiling: number   // inter-sample peak ceiling — ensures no overs on D/A
  
  // Algorithm
  algorithm: 'transparent' | 'punch' | 'loud' | 'brick_wall' | 'intelligent'
  attack: number            // ms: 0.01 → 1.0 (faster = more transparent transients)
  release: number           // ms: 10 → 500 (or 'program' — auto-release)
  lookahead: number         // ms: 0 → 20 (allows perfectly transparent limiting)
  oversample: 4 | 8 | 16   // true peak detection oversampling
  
  // Loudness targeting
  lufsTarget: number        // LUFS: -30 → -6 (typical: -14 YouTube, -16 Spotify, -27 Netflix)
  lufsAutoGain: boolean     // auto-adjust input gain to hit LUFS target
  
  // Meters
  gainReductionMeter: number  // live dB gain reduction
  truePeakMeter: number       // live inter-sample peak level
  lufsIntegrated: number      // live LUFS since last reset
  lufsShortTerm: number       // live 3s window LUFS
  lufsMomentary: number       // live 400ms window LUFS
  lufsHistory: number[]       // 60s rolling graph data
  
  // Dithering (inline — no separate stage needed)
  dither: 'none' | 'tpdf' | 'noise_shaped_1' | 'noise_shaped_2' | 'pow_r_3'
  ditherBitDepth: 16 | 20 | 24 | 32
}
```

### 2.9 — Master Metering Suite

Dedicated metering panel (right side of Mastering workspace):

```
METERS (all live, all real-time):

LOUDNESS PANEL:
  LUFS Integrated      — since last reset; large display
  LUFS Short Term      — 3-second window; large display
  LUFS Momentary       — 400ms window
  LU Range (LRA)       — dynamic range measurement
  True Peak            — inter-sample peak in dBTP
  Programme Loudness History — 60-second scrolling graph

PLATFORM TARGETS (reference lines on meter):
  YouTube:   -14 LUFS integrated
  Spotify:   -14 LUFS (Premium) / -11 (Free)
  Apple:     -16 LUFS
  Tidal:     -14 LUFS
  Netflix:   -27 LUFS (dialogue)
  Broadcast: -23 LUFS (EBU R128) / -24 (ATSC A/85)
  CD:        -9 to -6 LUFS (competitive)

SPECTRUM ANALYSER:
  Full-range FFT (as per EQ section)
  Reference track overlay (pink)
  Difference curve (your track vs reference)

PHASE SCOPE (Lissajous):
  X/Y plot of L vs R channels
  Circle = perfect stereo, Vertical line = mono, Horizontal = out-of-phase
  Adjustable time window (0.1s / 0.5s / 1s)
  
CORRELATION METER:
  -1.0 (out-of-phase) → +1.0 (mono-compatible)
  Red zone alert: below 0.0

LOW-END ANALYSER:
  Dedicated 20Hz–250Hz display
  Shows sub-bass (20–60Hz) and bass (60–200Hz) balance
  Mono/stereo indicator at each frequency (mono below 120Hz is standard)
  Kick-bass relationship visualizer

K-SYSTEM METERING (option):
  K-20 / K-14 / K-12 (film/broadcast/CD standard)
```

### 2.10 — Reference Track Comparator

```
WORKFLOW:
  1. Drag any commercial track (WAV/MP3) into Reference Slot
  2. Level-matched A/B toggle (Ctrl+R): your master vs reference at same loudness
  3. Spectrum comparison overlay: see where your track differs spectrally
  4. LUFS comparison: your level vs reference level
  5. Dynamic range comparison (LRA)
  6. Forge Intelligence analysis: 
     "Reference has significantly more energy at 60-120Hz and less at 3-5kHz.
      Suggest: +1.5dB low shelf at 90Hz, -0.8dB bell at 3.5kHz"
     (HIDDEN: all AI calls; user sees "Analysing reference...")

AI REFERENCE MATCHING:
  Optional: auto-generate a correction curve to match the tonal profile of reference
  Shows: confidence score + warnings for problematic matches
```

### 2.11 — Stem Mastering Mode

```
STEM MASTERING:
  Import up to 32 stems (vocals, drums, bass, guitars, synths, FX, etc.)
  Each stem has its own processing chain (mini EQ + compressor + level)
  Master bus chain processes the sum
  Output: individual mastered stems + combined master
  
WORKFLOW:
  File → New Mastering Session → Stem Mode
  Drag stems to slots
  Process each stem for blend (not full mix EQ — just trim)
  Master bus: full 9-stage chain
  Export: all stems + master in one batch
```

### 2.12 — AI Mastering Assistant (Forge Intelligence)

```
LOCATION: Button in Mastering workspace — "Forge Intelligence: Master This"

WHAT IT DOES:
  1. Analyses the mix (spectral balance, dynamic range, LUFS, stereo width, phase)
  2. Compares against platform target (user selects: YouTube, Spotify, Apple, Film, etc.)
  3. claude-opus-4-8 generates recommended settings for all 9 stages
  4. Presents a non-destructive recommendation:
     "Suggested corrections for Spotify release master:"
     → Stage 1 EQ: High-pass 22Hz, -2.5dB bell at 280Hz, +1.2dB shelf at 12kHz
     → Bus Compressor: SSL G-Bus, 1.8:1, 20ms attack, auto release, -1.5dB GR target
     → Limiter: -14 LUFS target, -0.3dBFS ceiling
  5. User previews and accepts/modifies each suggestion
  6. Saved as a named preset

WHAT USERS SEE: "Forge Intelligence is analysing your mix..."
WHAT IS HIDDEN: claude-opus-4-8, API calls, cost
```

---

## PART 3 — FORGE MICRO COLOUR
### "Below the Wheels — Surgical Precision for the Discerning Colourist"

Forge Micro Colour is a dedicated precision panel that lives **below the standard colour
wheels** on the Color page. It provides sub-stop, sub-degree, and sub-IRE adjustments
that are impossible to achieve with the standard wheel interface.

---

### 3.1 — Precision Numeric Sliders Panel

Replaces and supplements the standard slider values below the wheels.

```typescript
interface MicroColourSliders {
  // LUMINANCE PRECISION
  exposureStops: number        // stops: -8.000 → +8.000, step: 0.001 stops
  exposureIRE: number          // IRE: 0.00 → 100.00, step: 0.01 IRE (displays alongside)
  contrastAmount: number       // %: 0.00 → 200.00, step: 0.01
  contrastPivot: number        // IRE: 0.00 → 100.00 (where contrast is centred), step: 0.01
  
  // PER-CHANNEL MICRO TRIM (independent R/G/B offset)
  redTrim: number              // offset: -0.500 → +0.500, step: 0.001
  greenTrim: number            // offset: -0.500 → +0.500, step: 0.001
  blueTrim: number             // offset: -0.500 → +0.500, step: 0.001
  
  // WHITE BALANCE PRECISION
  kelvins: number              // 1000K → 12000K, step: 10K (live Kelvin display)
  tint: number                 // green-magenta: -150.0 → +150.0, step: 0.1
  
  // TONE ZONE CONTROLS
  highlightRecovery: number    // 0.00 → 100.00 — recover clipped highlights, step: 0.01
  shadowDetail: number         // 0.00 → 100.00 — lift shadow detail, step: 0.01
  blackPoint: number           // IRE: -20.00 → +20.00 (crush or lift absolute black), step: 0.01
  whitePoint: number           // IRE: 80.00 → 120.00 (set absolute white ceiling), step: 0.01
  
  // SATURATION PRECISION
  saturation: number           // 0.000 → 4.000, step: 0.001
  vibrance: number             // intelligent sat (protects skin): -100 → +100, step: 0.1
  hueSpin: number              // global hue rotation: -180.00° → +180.00°, step: 0.01°
  
  // LOCAL CONTRAST (Micro-Contrast)
  clarity: number              // mid-tone contrast: -100 → +100, step: 0.1
  texture: number              // fine detail (HF local contrast): -100 → +100, step: 0.1
  microContrast: number        // very fine structure: -100 → +100, step: 0.1
  dehaze: number               // remove atmospheric haze: -100 → +100, step: 0.1
}
```

### 3.2 — Zone System Panel (10-Stop Exposure Zones)

```
Based on Ansel Adams' Zone System — maps 10 stops of exposure to 10 tonal zones.
Each zone is independently controllable.

ZONE DISPLAY:
  ┌────────────────────────────────────────────────────────────────────┐
  │  Z0    Z1    Z2    Z3    Z4    Z5    Z6    Z7    Z8    Z9    Z10  │
  │  ████  ████  ████  ████  ████  ████  ████  ████  ████  ████  ░░░░  │
  │ 0 IRE                      50 IRE                         100 IRE  │
  └────────────────────────────────────────────────────────────────────┘

Each zone has:
  Luminance adjust: ±2 stops (step: 0.001)
  Colour temp shift: -500K → +500K (step: 10K)
  Saturation trim: ±50% (step: 0.1%)
  Hue shift: ±30° (step: 0.01°)
  Detail/sharpness: -50 → +100 (step: 0.1)
  
Zone range controls:
  Start IRE (bottom of zone): step 0.1 IRE
  End IRE (top of zone): step 0.1 IRE
  Feather into lower zone: 0–100%
  Feather into upper zone: 0–100%

Zone isolation toggle: click zone header → preview shows only that zone highlighted

ZONE PRESETS:
  Cinematic: boost Z4-Z6, compress Z8-Z9, lift Z1-Z2 slightly
  Documentary: flat, accurate, no creative zones
  HDR: extended Z8-Z10 with specular protection
  Night: boost Z1-Z3, desaturate Z0
  Golden Hour: warm Z6-Z8, cool Z2-Z3
```

### 3.3 — HDR Specular & Nit Control

```typescript
interface HDRMicroControls {
  // SPECULAR RECOVERY
  specularRolloff: number      // nits: where specular clipping begins to roll off
                               // range: 200 → 4000 nits, step: 10 nits
  specularCurve: 'linear' | 'sigmoid' | 'highlight_roll' | 'film'
  
  // HIGHLIGHT PROTECTION
  highlightCompression: number // 0–100: how much to compress near ceiling
  specularDesaturate: number   // 0–100: desaturate as highlights approach ceiling
                               // (simulates real-world light specular behaviour)
  
  // NIT CEILING
  nitCeiling: 100 | 400 | 600 | 1000 | 1600 | 4000 | 10000
              // corresponds to: SDR, HDR400, HDR600, HDR1000, HDR1600, Dolby Vision
  nitDisplay: boolean          // show nit scale on waveform scope
  
  // TONE MAPPING
  toneMappingAlgorithm: 'none' | 'reinhard' | 'aces_ap1' | 'hable' | 'davinci_wide_gamut'
  
  // ZONE-SPECIFIC LIGHTING
  shadowWarmth: number         // Kelvin shift in Z0-Z3: -500K → +500K, step: 10K
  shadowCoolness: number       // alias for negative shadow warmth
  highlightWarmth: number      // Kelvin shift in Z7-Z10: -500K → +500K, step: 10K
  midtoneTemp: number          // Kelvin shift in Z4-Z6: -300K → +300K, step: 10K
}
```

### 3.4 — Skin Tone Precision Tools

```
SKIN TONE PROTECTION SYSTEM:
  - Skin Tone Indicator Line: visible on vectorscope (the diagonal line ~35° bearing)
  - Skin Tone Selector: eyedropper → sample from skin in frame → locks reference
  - Skin Hue Guard: toggle — prevents any grade from shifting skin ±5° from reference
    (can be overridden per node, but shows warning badge)
  - Skin Luminance Guide: indicator on waveform showing where skin should sit:
    Lighter skin tones:  65–75 IRE
    Medium skin tones:   45–60 IRE
    Darker skin tones:   30–45 IRE
    Deep skin tones:     15–30 IRE

FACE DETECTION INTEGRATION:
  When face detection is active (from B14 tracker):
  - Auto-draws qualifier around detected face region
  - Per-face micro-grade panel shows alongside main controls
  - Independent brightness/saturation/warmth per face
  - Tracks across clip duration

SKIN SMOOTHING (non-destructive):
  - Uses MD (Mid/Detail) style adjustment within face qualifier window
  - Softness amount: 0–100
  - Keeps texture at higher frequencies
  - Only affects qualified skin region
```

### 3.5 — Lighting Adjustment Controls

```typescript
interface LightingAdjustments {
  // DIRECTIONAL RELIGHT (AI — fal.ai IC-Light model)
  relightEnabled: boolean
  lightDirection: { x: number, y: number }  // -1.0 → +1.0 on 2D plane
  lightIntensity: number                     // 0 → 3.0
  lightColourTemp: number                    // 2000K → 8000K
  relightBlendMode: 'multiply' | 'screen' | 'overlay' | 'normal'
  relightStrength: number                    // 0.0 → 1.0, step: 0.01
  
  // ATMOSPHERIC CONTROLS
  fogginess: number                          // 0–100 (adds aerial perspective)
  haze: number                               // 0–100 (atmospheric scattering)
  bloomRadius: number                        // pixels: 0 → 200 (light bloom/glow)
  bloomThreshold: number                     // IRE: 50 → 100 (only bloom above this)
  bloomIntensity: number                     // 0.0 → 5.0
  
  // VIGNETTE (precise)
  vignetteShape: 'circular' | 'oval' | 'rectangular' | 'custom_bezier'
  vignetteCentreX: number                    // -1.0 → +1.0 (horizontal offset)
  vignetteCentreY: number                    // -1.0 → +1.0 (vertical offset)
  vignetteSize: number                       // 0.0 → 2.0
  vignetteFeather: number                    // 0.0 → 1.0
  vignetteOpacity: number                    // 0.000 → 1.000, step: 0.001
  vignetteMode: 'subtract' | 'multiply' | 'power' | 'digital'
  vignetteColour: string                     // hex (default: #000000)
  
  // DIFFUSION / BLOOM FILTER
  diffusionEnabled: boolean
  diffusionStyle: 'classic_net' | 'pro_mist' | 'star_filter' | 'light_haze'
  diffusionAmount: number                    // 0.000 → 1.000, step: 0.001
  diffusionHighlightBias: number             // 0–100 (bias towards highlights only)
  
  // LENS DISTORTION CORRECTION
  lensDistortion: number                     // -100 → +100 (barrel ↔ pincushion)
  lensChromatic: number                      // 0 → 100 (chromatic aberration removal)
  lensPerspective: {
    tilt: number                             // degrees: -30 → +30, step: 0.01
    shift_h: number                          // pixels: -500 → +500, step: 0.1
    shift_v: number                          // pixels: -500 → +500, step: 0.1
  }
}
```

### 3.6 — Node Micro-Controls

Per-node precision controls (visible when any node is selected in the node graph):

```typescript
interface NodeMicroControls {
  blendStrength: number        // 0.00 → 1.00, step: 0.01
                               // 0 = bypassed, 1 = full, 0.5 = half-grade
  inputGain: number            // dB: -12.00 → +12.00, step: 0.01
  outputGain: number           // dB: -12.00 → +12.00, step: 0.01
  qualifierStrength: number    // 0.000 → 1.000, step: 0.001
                               // modulates how strongly qualifier isolates
  keyerGain: number            // 0.000 → 1.000 (alpha strength of qualifier mask)
  blurQualifier: number        // pixels: 0.0 → 50.0 (soften qualifier edge)
  note: string                 // per-node annotation
  colour: string               // node label colour (for organisation)
}
```

### 3.7 — Colour Densitometer

```
DENSITOMETER TOOL (D key shortcut):
  Hover over any point in the preview → shows:
    Code Value:   0–1023 (10-bit) / 0–4095 (12-bit) / 0–65535 (16-bit)
    IRE:          0.00 → 100.00
    Nits:         if in HDR mode
    LAB:          L* a* b* (perceptual colour)
    RGB:          normalised 0.000–1.000 per channel
    HSL:          Hue/Saturation/Lightness
    Hex:          #RRGGBB

MULTI-POINT SAMPLING:
  Drop up to 8 sample points anywhere on frame
  All points persist across playback
  Show history graph per point (how values change over clip duration)
  Useful for: ensuring neutral grey stays neutral throughout shot
```

### 3.8 — Colour Checker / Chart Calibration

```
COLOUR CHECKER TOOL:
  Detects standard colour reference charts (X-Rite ColorChecker Classic, Passport)
  auto-detects chart presence in frame
  Analyses deviation from reference values per patch
  Generates correction node that aligns all 24 patches to ground truth
  Reports: ΔE per patch (colour error), overall accuracy score
  Allows: set which patches to include/exclude in correction

USE CASE:
  Shoot includes a colour chart clapper → one-click calibrate every shot from that setup
  Ensures scientifically accurate colour reproduction for medical/commercial/legal content
```

### 3.9 — Multi-Point White Balance

```
MULTI-POINT WHITE BALANCE:
  Standard white balance: one sample point → global correction
  Multi-point: sample up to 4 reference points (different areas of frame)
  Forge calculates weighted average
  Option: perspective-weighted (foreground points weighted higher)
  
MIXED LIGHTING CORRECTION:
  For scenes with tungsten + daylight simultaneously:
  Set separate white balance zones (left half tungsten, right half daylight)
  Uses masking to blend correction across frame
  AI-assisted: detects mixed sources and suggests zone layout
```

---

## PART 4 — SPRINT ADDENDUM FOR CURSOR

Add these sprints to Phase 2 (Color Science) and Phase 4 (Audio DAW).
Insert between existing sprints or replace as specified.

---

### SPRINT 11-B: Forge Spectrum EQ (Replaces Sprint 21 EQ component)

```
Goal: Full 20-band EQ with all 4 modes, M/S, match EQ, delta monitoring.

Files to create:
  src/renderer/components/audio/eq/
    ForgeSpectrumEQ.tsx          — main component
    EQCanvas.tsx                 — WebGL frequency response curve rendering
    EQBand.tsx                   — draggable band handle
    EQPhaseResponse.tsx          — phase response overlay
    EQSpectrumAnalyser.tsx       — real-time FFT display (Web Audio AnalyserNode)
    MatchEQPanel.tsx             — reference analysis + correction curve
    BandConfigPanel.tsx          — per-band parameter panel (click band to expand)
    MidSidePanel.tsx             — M/S routing controls
    AnalogCharacterPanel.tsx     — analog model selection per band
    DynamicEQPanel.tsx           — per-band dynamic controls

  src/main/audio/
    eqEngine.ts                  — DSP engine (Web Audio biquad filter chains)
    fftAnalyser.ts               — FFT worker for spectrum display
    matchEQ.ts                   — reference analysis + curve generation
    analogModels.ts              — filter coefficient adjustments per analog model

Acceptance criteria:
  - 20 bands individually draggable on frequency display
  - Mode switch (Standard/Linear/Dynamic/Analog) changes rendering + behaviour
  - M/S: independent Mid and Side processing confirmed with phase scope
  - Match EQ: load reference WAV → generates correction → applies within 3s
  - Delta monitor: Δ button isolates what EQ is adding/removing
  - All precision values: exact number input accepted (e.g., "2.534kHz")
  - Phase response: updates in real time as bands change
```

### SPRINT 22-B: Forge Master Suite (New sprint — after Sprint 22)

```
Goal: Complete 9-stage mastering chain with metering suite and reference comparator.

Files to create:
  src/renderer/components/audio/mastering/
    MasterSuite.tsx              — workspace tab, 9-stage chain
    BusCompressor.tsx            — Stage 2: glue compressor
    MultibandDynamics.tsx        — Stage 3: 6-band dynamics
    SaturationStage.tsx          — Stage 4: tape/tube character
    StereoImager.tsx             — Stage 6: per-band width
    SoftClipper.tsx              — Stage 7: transparent clipping
    TruePeakLimiter.tsx          — Stage 8: limiter + LUFS
    MeteringPanel.tsx            — all meters (LUFS, phase, spectrum, Lissajous)
    ReferenceComparator.tsx      — A/B comparison against commercial reference
    StemMasteringPanel.tsx       — stem import + per-stem trim chain
    AIAssistantPanel.tsx         — Forge Intelligence mastering suggestions

  src/main/audio/mastering/
    masterChain.ts               — signal graph (9-stage AudioWorklet chain)
    busCompressor.ts             — VCA/optical/FET/variable-μ compressor models
    multibandSplitter.ts         — Linkwitz-Riley crossover network
    tapeModel.ts                 — tape emulation (hysteresis loop simulation)
    stereoImager.ts              — per-band M/S processing
    truePeakLimiter.ts           — ISP-compliant limiter + dither
    lufsMetering.ts              — ITU-R BS.1770-4 LUFS
    referenceAnalyser.ts         — FFT + LUFS analysis of reference track

Acceptance criteria:
  - Full 9-stage chain processes audio end-to-end at 24-bit/48kHz minimum
  - Bus compressor: all 5 analog models sound distinctly different
  - LUFS metering: confirmed against reference measurements (±0.1 LU tolerance)
  - True peak: no inter-sample peaks above ceiling on any test signal
  - Reference comparator: level-matched A/B toggle within 1 keypress
  - Stem mastering: 8 stems + master all export correctly
  - Dither: 16-bit TPDF dither verified with null test (no truncation artifacts)
```

### SPRINT 15-B: Forge Micro Colour (New sprint — after Sprint 15)

```
Goal: Complete surgical precision colour panel with zone system, HDR controls, 
      skin tools, lighting adjustments, densitometer, and colour checker.

Files to create:
  src/renderer/components/color/micro/
    MicroColourPanel.tsx         — expandable panel below standard wheels
    PrecisionSliders.tsx         — numeric-entry sliders (3.1)
    ZoneSystemPanel.tsx          — 10-zone interactive display (3.2)
    HDRSpecularPanel.tsx         — HDR nit/specular controls (3.3)
    SkinToneProtection.tsx       — skin detection + guard system (3.4)
    LightingAdjustments.tsx      — relighting, vignette, diffusion, bloom (3.5)
    NodeMicroControls.tsx        — per-node blend/gain/qualifier (3.6)
    ColourDensitometer.tsx       — hover densitometer + multi-point sampler (3.7)
    ColourChecker.tsx            — chart detection + calibration (3.8)
    MultiPointWhiteBalance.tsx   — 4-point WB with mixed lighting (3.9)

  src/main/color/
    zoneSystem.ts                — zone range calculation + blending math
    hdrSpecular.ts               — nit-ceiling enforcement + rolloff curves
    skinToneGuard.ts             — hue guard + face detection integration
    relightEngine.ts             — IC-Light API integration (fal.ai)
    colourDensitometer.ts        — pixel sampling from frame buffer
    colourCheckerDetection.ts    — X-Rite chart detection + correction

Acceptance criteria:
  - Exposure slider: 0.001-stop increments are visually distinct in scopes
  - Zone system: adjusting Z5 (midtones) only affects mid-tonal range
  - HDR: specular rolloff at 1000 nits prevents clipping on test PQ signal
  - Skin guard: enabled → grade cannot shift skin hue outside ±5° tolerance
  - Densitometer: hover over any pixel → LAB, RGB, IRE, nits all accurate
  - Colour checker: loads X-Rite chart → detects all 24 patches → correction within ΔE 2.0
  - Relighting: AI relight changes apparent light direction visibly within 10s
  - Node blend: 0.50 blend = exactly half the grade effect confirmed with scopes
```

---

## UPDATED CURSOR FEED ORDER

Add this document at position 18, after `CINEMA_V3_CURSOR_PROMPT.md`:

```
17. CINEMA_V3_CURSOR_PROMPT.md            — V3 build instructions (45 sprints)
18. CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md  ← THIS DOCUMENT

When processing the addendum:
  - Sprint 11-B: Implement AFTER Sprint 11 (node graph), BEFORE Sprint 12
  - Sprint 15-B: Implement AFTER Sprint 15 (AI grade), AS the new Sprint 16
    (push all subsequent color sprints back 1)
  - Sprint 22-B: Implement AFTER Sprint 22 (spatial audio), BEFORE Sprint 23
    (push all subsequent audio sprints back 1)
  
Total new sprint count: 48 sprints (45 + 3 addendum)
Nothing from original 45 sprints is removed.
The addendum supplements — it does not replace.
```

---

## DEFINITION OF DONE — AUDIO & COLOUR PRECISION

All items below must be ✅ before V3 ships:

**Audio EQ:**
- [ ] 20-band EQ implemented with all band types (11 types)
- [ ] All 4 modes work: Standard, Linear Phase, Dynamic, Analog Character
- [ ] All 8 analog models produce distinct, measurable tonal differences
- [ ] M/S processing confirmed with null test on mono content
- [ ] Match EQ generates correct correction curve from reference
- [ ] Delta monitoring audibly isolates EQ contribution only
- [ ] Phase response display accurate (confirmed with FFT)
- [ ] All band values editable to 0.01dB / 1Hz / 0.01Q precision

**Mastering Suite:**
- [ ] All 9 stages in correct signal flow order
- [ ] Bus compressor: all 5 models behave distinctly
- [ ] Multiband: 6 bands with correct Linkwitz-Riley crossovers
- [ ] Tape saturation: harmonic content added (confirmed with spectrum)
- [ ] Stereo imager: per-band width confirmed with correlation meter
- [ ] True peak limiter: no ISP overs at any test input level
- [ ] LUFS metering: ±0.1 LU accuracy vs reference measurement
- [ ] Dither: 16-bit TPDF confirmed noise-shaped type passes null test
- [ ] Reference comparator: level-matched A/B toggle ≤2 frames latency
- [ ] AI mastering suggestions: generated within 15s, actionable

**Colour Precision:**
- [ ] Precision sliders: 0.001-stop increments visible on waveform
- [ ] Zone system: 10 zones independently adjustable with feather
- [ ] HDR controls: nit ceiling enforced; specular rolloff visible on scope
- [ ] Skin tone guard: prevents hue shift beyond ±5° when enabled
- [ ] Densitometer: all 7 colour formats accurate on any frame pixel
- [ ] Colour checker: detects X-Rite Classic chart; correction within ΔE 2.0
- [ ] AI relighting: visible light direction change within 10s
- [ ] Node blend strength: 0.50 = confirmed half-grade on scope
- [ ] Zone-specific Kelvin shift: shadow warmth doesn't affect highlights

---

*Cinematic Forge V3 — Audio & Colour Precision Addendum*
*Addendum Version: 1.0 | May 2026*
*3 Additional Sprints (48 total) | Requires: Cursor Agent with claude-opus-4-8*
