# SPEC-07 — AUDIO (56 controls)
# Inherits SPEC-00. Audit: 19 WIRED / 0 UI-ONLY / 4 STUB / 33 ABSENT (largest absent).
# The CREATIVE audio pipeline (voice/SFX/music/mix/LUFS) is REAL. The absent 33 are
# almost all MASTERING-ENGINEER DEPTH (Spectrum EQ, 9-stage Master Suite, Atmos) —
# specced fully but TIER-3, build on real demand. Paid: ElevenLabs/Suno (confirm gated).
# Entity: AudioTrack, mixer strip config.

═══════════════════════════════════════════════════════════════════════
# GROUP A — VOICE (creative pipeline, mostly wired)
═══════════════════════════════════════════════════════════════════════

### Per-character voice   [WIRED]  (voiceId on character, named in card, AwaitingDirectionCard.tsx:403). Cross-ref SPEC-04-character. TIER: —.

### TTS model (v3 / flash)   [ABSENT → TIER 2]
- Always eleven_multilingual_v2 unless ELEVENLABS_MODEL_ID env (client.ts:69). No
  picker. UI: (build) model dropdown per voice/line. eleven_v3 = better emotion.
  BACKEND: pass model_id to the TTS call (already parameterized by env). TIER 2 (cheap).

### Emotion slider   [ABSENT → TIER 2 — HIGH VALUE]
- style hardcoded to 0 (client.ts:73). UI: (build) 0…1 emotion/style slider per line.
  BACKEND: the TTS call ALREADY takes style — just expose it. Voice PERFORMANCE is
  film-critical and currently frozen. Cheap plumbing-exists fix. TIER 2.

### Stability slider   [ABSENT → TIER 2 — HIGH VALUE]
- stability hardcoded 0.5, similarity 0.75 (client.ts:71). UI: (build) two sliders.
  BACKEND: already params on the TTS call. Expose. TIER 2 (with emotion, one batch).

### Voice clone   [WIRED]  (upload → ElevenLabs id, CharactersSection.tsx:42). TIER: —.

### Voice design   [ABSENT → TIER 3]
- Generate a custom voice from a description (for characters w/o reference audio).
  UI: (build) describe-a-voice → ElevenLabs Voice Design → store as voiceId. Gated.
  Cross-ref SPEC-04 (voiceSource:'designed'). TIER 3.

### Text-to-dialogue   [ABSENT → TIER 3]
- Multi-speaker conversation in one call (natural turn-taking). Currently lines are
  synthesized one at a time. UI: (build) a dialogue block; BACKEND: ElevenLabs
  text-to-dialogue. Better for 2-char scenes. TIER 3 (enrichment).

═══════════════════════════════════════════════════════════════════════
# GROUP B — LIP-SYNC & ALIGNMENT
═══════════════════════════════════════════════════════════════════════

### Forced alignment   [WIRED]  (alignSpeech stores word start/end, dialoguePipeline.ts:67; pause-gated). TIER: —.
### Lip-sync on/off   [WIRED]  (checkbox; job skips when model=Grok, processShotGenerateJob.ts:248). TIER: —.
### Lip-sync model picker   [ABSENT → TIER 3]
- A stored lipSyncModel is used if present; else mode default LatentSync
  (lipSyncPass.ts:52). No picker. UI: (build) dropdown (LatentSync/sync-lipsync/
  OmniHuman). BACKEND: route to the chosen model, gated. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP C — SFX & MUSIC
═══════════════════════════════════════════════════════════════════════

### Text → SFX   [WIRED]  (ElevenLabs text-to-sound-effects, MusicSection.tsx:17; gated). TIER: —.
### SFX volume   [WIRED]  (track fader 0…2, MixerPanel.tsx:1883). TIER: —.
### AI SFX from the shot   [ABSENT → TIER 3]
- Propose SFX from the picture content. UI: (build) "suggest SFX"; BACKEND: LLM
  (mechanical tier) reads the shot → SFX prompts → text-to-SFX. TIER 3.

### Text → music   [WIRED]  (Suno, MusicSection.tsx:14 / suno.ts:36; gated). TIER: —.
### Video → music   [ABSENT → TIER 3]
- Score to the actual assembled cut. UI: (build) "score this scene"; BACKEND:
  ElevenLabs video-to-music on the assembled scene. Cross-ref addendum-elevenlabs.
  TIER 3 (enrichment).
### Stem separation   [STUB → TIER 3]
- SpeakerSeparator.ts:59 writes stems; no screen calls it. FIX: mount a "separate
  stems" action (vocals/drums/bass/etc.). Built, unmounted. TIER 3.
### Mood / genre / tempo   [ABSENT → TIER 2]
- One text field "mood, genre, instruments" (MusicSection.tsx:31); no tempo/genre
  controls. UI: (build) structured fields → Suno params. TIER 2 (small).
### Ducking   [WIRED]  (dialogue sidechains the bed, audioAssembly.ts:90; mixer names
  the key track). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP D — DUBBING
═══════════════════════════════════════════════════════════════════════
### Dubbing   [STUB → TIER 3]  (translate route runs SadTalker when dubAudio+resyncLips
  set, translate/video/route.ts:94; no dubbing desk). FIX: build a dubbing panel →
  ElevenLabs Dubbing (timing-preserved), per language. Cross-ref addendum-elevenlabs.
### Timing-preserved dub   [ABSENT → TIER 3]  (SadTalker is still+audio, not retimed
  picture. Use ElevenLabs Dubbing for real timing preservation.) TIER 3.
### Per-language re-lipsync   [STUB → TIER 3]  (same translate branch; not wired to the
  shot lip-sync. Wire per-language lipsync in the dubbing build.) TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP E — MIXER (mostly wired)
═══════════════════════════════════════════════════════════════════════
### Fader   [WIRED]  (MixerPanel.tsx:1883). ### Pan   [WIRED]  (−1…1, automatable :1600/1606).
### Solo   [WIRED]  (:268, group-solo :1957 — not a VCA). ### Mute   [WIRED]  (:261).
### Phase   [WIRED]  (:275). ### Sends   [WIRED]  (aux pre/post, ipc.ts:149).
### Sidechain   [WIRED]  (one comp, audioAssembly.ts:90). ### Delay   [WIRED]  (bus ms, ipc.ts:214).
### De-esser   [WIRED]  (dynamic cut ~6.5kHz, ipc.ts:231). ### Reverb   [WIRED]  (multi-tap echo, ipc.ts:227).
All TIER: —.
### Meter   [ABSENT → TIER 2]  (no per-strip level meter. UI: (build) a meter from the
  audio analysis. Useful, small.) TIER 2.
### VCA groups   [ABSENT → TIER 3]  (no VCA fader; group-solo exists but isn't a VCA.
  Build a VCA that scales member faders.) TIER 3.
### Snapshot automation   [ABSENT → TIER 3]  (pan/some knobs store points; no mixer
  snapshot. Build capture-all-fader-states + interpolate.) TIER 3.
### Convolution reverb   [ABSENT → TIER 3]  (no impulse loader; reverb is echo. Build
  IR convolution — FFmpeg afir.) TIER 3.
### Multiband compressor   [ABSENT → TIER 3]  (band-split + per-band comp. FFmpeg
  acrossover + acompressor per band.) TIER 3.
### VCA / FET / Opto / Vari-µ topologies   [ABSENT → TIER 3]  (one comp amount 0…100,
  no topology switch, MixerPanel.tsx:1384. Model each topology's attack/knee curve.) TIER 3.
### AI pitch   [ABSENT → TIER 3]  (auto-tune; fal/DSP model.) TIER 3.
### AI de-breathe   [ABSENT → TIER 3]  (detect+reduce breaths; DSP/model.) TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP F — FORGE SPECTRUM EQ (20-band — ALL ABSENT, one build)
═══════════════════════════════════════════════════════════════════════
The only EQ UI is the UNMOUNTED 6-band ParametricEQ (ParametricEQ.tsx:20;
buildParametricEQ can emit an FFmpeg chain). The 20-band Spectrum EQ is absent.

### Parametric EQ   [STUB → TIER 2]  (6-band component built, unmounted. MOUNT it —
  it's a working EQ, cheap win. buildParametricEQ emits the FFmpeg chain.) TIER 2.

### 20-band spectrum EQ + band types + modes + M/S + FFT + Match + Delta   [ALL ABSENT → TIER 3, ONE build]
- PURPOSE: mastering-grade 20-band EQ (the SPEC-08 showcase depth).
- UI: (build) 20 bands (16Hz–22kHz@1Hz, ±30dB@0.01, Q@0.01), band-type per band
  (bell/shelf/pass/notch/bandpass/tilt/baxandall/pultec/allpass), 4 modes
  (Standard IIR / Linear-Phase FIR / Dynamic / Analog: Neve/SSL/Pultec/API/Manley/
  Sontec), M/S processing, 16k-FFT analyser, Match EQ, Delta monitoring.
- BACKEND (build sketch): the EQ chain = FFmpeg anequalizer / firequalizer (linear
  phase) with per-band type. Dynamic mode = per-band acompressor sidechained to the
  band. Analog modes = the band curve + a modeled harmonic/saturation stage
  (aexciter/asubboost tuned per model). M/S = channelsplit to mid/side, EQ each,
  merge. FFT analyser = a display from audio analysis. Match EQ = analyze reference
  spectrum → compute correction curve. Delta = solo the EQ's delta signal.
- STRATEGIC NOTE: this is DEEP mastering-engineer depth. High effort, narrow v1
  audience. The mounted 6-band EQ (above) + LUFS normalization already get a film
  to a professional loudness/tonal target. Build the 20-band + analog modes ONLY on
  real mastering demand. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP G — FORGE MASTER SUITE (9-stage chain — ALL ABSENT, one build)
═══════════════════════════════════════════════════════════════════════

### Master chain (9 stages) + AI master + stem mastering + reference comparator   [ALL ABSENT → TIER 3, ONE build]
- PURPOSE: the 9-stage mastering chain (input gain → corrective EQ → bus comp model
  → 6-band multiband → tape/tube sat → creative EQ → stereo imager → soft clip →
  true-peak limiter → dither).
- UI: (build) a mastering workspace with the 9 stages in order, each with its controls.
- BACKEND (build sketch): a serial FFmpeg chain — corrective/creative EQ (Group F
  engine), bus comp (acompressor, model = tuned params for SSL/Neve/API/Fairchild),
  multiband (acrossover + per-band acompressor), tape/tube sat (aexciter + soft
  saturation), stereo imager (M/S width per band), soft clip (alimiter soft), true-
  peak limiter (alimiter + LUFS target, EXISTS partially via normalize.ts), dither
  (aphasemeter/dither on export). AI master = LLM/DSP proposes stage settings.
  Reference comparator = level-matched A/B vs a loaded track.
- STRATEGIC NOTE: the DEEPEST audio feature, the narrowest v1 audience, and it may
  NEVER be worth building fully — a filmmaker generating AI shots does not master
  like a record engineer. LUFS normalization (WIRED) already hits platform targets.
  This is the clearest "spec it, but build only on strong demand, possibly never."
- TIER: 3 (deprioritize hard).

═══════════════════════════════════════════════════════════════════════
# GROUP H — SPATIAL & METERING
═══════════════════════════════════════════════════════════════════════
### LUFS   [WIRED]  (measure + gain to −14/−16/−23, normalize.ts:26 / ipc.ts:1581). TIER: —.
### Dolby Atmos 7.1.4   [ABSENT → TIER 3]  (bed + object panner. Large, specialist. TIER 3.)
### 3D panner   [ABSENT → TIER 3]  (pan is stereo; 3D object panner for Atmos. TIER 3.)
### Binaural   [ABSENT → TIER 3]  (binaural render of the spatial mix. TIER 3.)
### Phase correlation   [ABSENT → TIER 2]  (correlation meter for mono compat. Small,
  useful. UI: (build) a correlation meter from analysis.) TIER 2.

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
The CREATIVE audio pipeline is REAL and wired (voice/clone/alignment/lipsync/SFX/
music/ducking/mixer/LUFS). For MAKING FILMS, the core is done.
TIER 2 (cheap, high-value — do soon):
- Emotion + stability + TTS-model (voice PERFORMANCE, plumbing exists, frozen now).
- Mount ParametricEQ (built, unmounted). Meter + phase correlation (small).
- Mood/genre/tempo music fields.
TIER 3 (mastering depth — DEFER, possibly forever):
- Spectrum EQ (20-band + analog modes) = ONE big build, mastering audience only.
- Master Suite (9-stage) = the deepest, narrowest — deprioritize hardest.
- Atmos/binaural, VCA, snapshot, multiband, convolution, AI pitch/de-breathe, voice
  design, text-to-dialogue, video-to-music, dubbing, stem sep (mount).
CONSOLIDATION: Groups F+G share the EQ/comp/sat FFmpeg engine — build the band-EQ
+ acompressor + saturation primitives ONCE; Spectrum EQ and Master Suite both
compose them. LUFS (wired) already covers the ACTUAL v1 mastering need.
HONESTY: don't advertise "replaces Logic/Fairlight" until the EQ/master chain
exists. Scope the pitch to the real (strong) creative pipeline + LUFS delivery.

## CROSS-REFS
- Per-character voice/voiceId/design → SPEC-04-character + addendum-elevenlabs.
- Video-to-music/dubbing/lipsync → addendum-elevenlabs (the enrichment plan).
- ElevenLabs/Suno gating → rule 1 / Tier-0 sweep (confirm all gated).
- ParametricEQ mount → the built-but-unmounted graveyard (SPEC-02/03/04/05).
- LLM SFX/data structuring → SPEC-10 mechanical tier.

## NEXT
Say "next" for SPEC-08 (Style / look / genre, 11 controls — small; has the
style-drop bug + the LUT-panel cheap win).
