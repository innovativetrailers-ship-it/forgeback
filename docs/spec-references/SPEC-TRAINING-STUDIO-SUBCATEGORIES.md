# SPEC — TRAINING STUDIO SUBCATEGORIES (cast, styles, genres, imports)
# The full asset taxonomy for the Training Studio sidebar. Extends
# SPEC-training-studio-sidebar + SPEC-TRAINING-MODEL-CATALOG. Obey INV-1..8.
# Every trained asset → a routable option the orchestrator delegates to.

═══════════════════════════════════════════════════════════════════════
# THE SIDEBAR — FOUR CLEAN CATEGORIES (Neo's UI separation)
═══════════════════════════════════════════════════════════════════════
Separate tabs to keep the UI clean — CHARACTERS / STYLES / ASSETS / VOICES (+ Music/SFX
as a sub of Styles or its own minor tab). CHARACTERS (people/creatures — identity) and
ASSETS (props/vehicles/products — objects) are SEPARATE: same training tech, different
concept + use. This is cleaner than lumping them as "Cast".

═══════════════════════════════════════════════════════════════════════
# THE ASSET TAXONOMY (sidebar tabs → subcategories)
═══════════════════════════════════════════════════════════════════════

## 1. CHARACTERS (people/creature LoRAs — identity consistency)
Subcategories (character-LoRA, trained via MiniMax H3 ref2va + flux-portrait):
- LEAD CHARACTER — a recurring protagonist (video+image dataset → strong identity LoRA)
- SUPPORTING CAST — secondary characters
- CREATURE / NON-HUMAN — an alien, monster, mascot (the earlier alien!)
- ENSEMBLE — multiple linked characters managed together
Each: name, description, trigger phrase, dataset (images+videos), + optional linked VOICE.
Attaches to VaultCharacter (LoRA + referenceUrls + seed + voiceId = full identity stack).

## 1b. ASSETS (object/prop LoRAs — object consistency) — SEPARATE tab
Subcategories (same tech as characters, tuned for objects — no voice link):
- VEHICLE — a signature car/ship/craft (racing/action)
- PROP / WEAPON — a recurring object
- PRODUCT — a brand product (consistent product placement)
- SET PIECE / ENVIRONMENT OBJECT — a landmark, a building, a machine
Each: name, description, trigger phrase, dataset (images+videos). Attaches to a shot as a
consistent object reference (routes to the /lora endpoint like a character LoRA).

## 2. STYLES (look LoRAs + instant presets) — genre subcategories
### INSTANT GENRE PRESETS (prompt+grade+camera, no training, free)
MOVIE / BLOCKBUSTER: Action | Sci-Fi | Drama | Romance | Comedy | Horror | Thriller | Fantasy
TV SERIES: Drama Series | Sitcom | Procedural | Reality | Soap
ANIME: Shonen (action) | Shojo | Seinen | Mecha | Slice-of-Life | Studio-style (Ghibli-esque
  look, NOT the brand) | Cel-shaded | Modern-digital
DOCUMENTARY: History | Science | Nature | Political | True-Crime | Biography | Investigative
SPORT: Broadcast | Cinematic-slow-mo | Hype-reel | Analysis
RACING: Onboard | Broadcast | Cinematic | Drift/Rally | F1-style
Each preset = { style-prompt language, color-grade params, camera defaults, pacing, grain }.
Selectable per project OR per shot. No cost. (Extends SPEC-08 style_key.)
### TRAINED STYLE LoRAs (optional — lock the look in)
Train a genre look harder (seeded from a preset) OR a custom look from the user's footage,
via H3-t2v / LTX-2 / FLUX.2 trainer → a StyleLora. Applied at inference (LoRA-capable endpoint).

## 3. VOICES (per character / narrator)
- CHARACTER VOICE — cloned/designed, linked to a Cast asset (ElevenLabs/MiniMax).
- NARRATOR — a documentary/trailer narration voice.
- Subcategory by use: dialogue | narration | announcer (sport/racing).

## 4. MUSIC / SFX STYLES (Stable Audio 3 + ElevenLabs Music)
- SCORE STYLE — a trained music style (Stable Audio 3 LoRA) per genre (action stinger,
  documentary ambience, anime OST-style).
- SFX PALETTE — a trained SFX character (racing engines, sport crowd, sci-fi tech).

═══════════════════════════════════════════════════════════════════════
# IMPORT SUBCATEGORIES (the "import" Neo listed — dataset sources per domain)
═══════════════════════════════════════════════════════════════════════
The training-data IMPORT flow is domain-aware — it helps the user assemble the right
dataset per what they're training. Import subcategories (each pre-configures the dataset
prep + captioning guidance + the recommended trainer):
- MOVIE — import film clips/stills → trains a cinematic style or a character. Guidance:
  varied shots, consistent grade. Trainer: H3-t2v (style) / H3-ref2va (character).
- TV SERIES — episodic footage → a series look or a recurring character (consistency
  across episodes is the point). Trainer: H3-ref2va (character), H3-t2v (series look).
- ANIME — anime clips/frames → an anime style LoRA (⚠ ONLY the user's own or licensed
  material — NOT copyrighted studio content; enforce in the import consent). Trainer:
  FLUX.2 (image style) / LTX-2 (motion style).
- DOCUMENTARY — doc footage → a documentary look (handheld, natural light, archival) +
  a narrator voice. Trainer: H3-t2v / LTX-2 (look), ElevenLabs (voice), Stable Audio (ambience).
- RACING — onboard/broadcast racing footage → a racing look (motion blur, speed, onboard
  framing) + engine SFX. Trainer: LTX-2 (motion), Stable Audio 3 (engine SFX).
- SPORT — sport footage → a broadcast/cinematic sport look + crowd SFX + announcer voice.
  Trainer: LTX-2 / H3-t2v (look), Stable Audio (crowd), ElevenLabs (announcer).
Each import subcategory: (a) captioning guidance tuned to the domain, (b) the recommended
trainer + settings, (c) a domain consent notice (own/licensed material only — esp. anime/
movie/TV where copyright risk is high), (d) SAM 3 subject-isolation for character datasets.

═══════════════════════════════════════════════════════════════════════
# ⚠ RIGHTS ENFORCEMENT (per the data/rights rule — critical for imports)
═══════════════════════════════════════════════════════════════════════
Import of MOVIE/TV/ANIME footage is the HIGHEST copyright-risk path. The import flow MUST:
- require the user to confirm they own or are licensed for the material (consent gate).
- NOT let the platform repurpose imported content (it's the user's, held to serve them).
- flag brand/IP names in genre presets as STYLE DESCRIPTORS, not brand replication
  ("Ghibli-esque look" is a descriptor; do NOT train on/replicate a specific studio's
  copyrighted films as a platform-shipped preset).
- deletion removes the imported dataset + the trained asset.
This protects the user AND the platform (the "your IP stays yours" moat — SPEC-training-
studio data/rights section).

═══════════════════════════════════════════════════════════════════════
# HOW SUBCATEGORIES FEED THE ORCHESTRATOR
═══════════════════════════════════════════════════════════════════════
- A project has a GENRE (movie-action, documentary-science, racing-broadcast, ...) →
  the orchestrator applies that genre's style preset (or trained StyleLora) + biases
  camera/pacing/grade to it. The genre is a project-level style context.
- Cast LoRAs → consistency-shot delegation routes to a LoRA-capable endpoint with the
  character's LoRA (strongest consistency).
- Voices → dialogue shots use the character's voice (native-audio model or ElevenLabs pass).
- Music/SFX styles → the audio layer applies the genre's score/SFX style.
So the subcategories = the user's PALETTE; the orchestrator COMPOSES from it per project genre.

## ACCEPTANCE
[ ] the sidebar has Cast / Styles / Voices / Music-SFX tabs with the subcategories above.
[ ] genre presets (movie/tv/anime/documentary/sport/racing + their sub-genres) apply an
    instant style; no training, no cost.
[ ] each asset type trains via the right verified FAL trainer (catalog); stored per user.
[ ] import subcategories pre-configure dataset prep + captioning + trainer + a CONSENT gate.
[ ] rights enforcement: own/licensed confirmation on movie/tv/anime import; no platform
    repurposing; deletion cascades; no brand-replication presets.
[ ] a project genre applies its style + routes cast LoRAs + voices + music styles via the orchestrator.
[ ] tsc + check:chokepoints green (all training = gated paid FAL calls, cost-confirmed).

## NET
The Training Studio taxonomy: CAST (lead/supporting/creature/object/ensemble character
LoRAs — H3 ref2va), STYLES (movie/tv/anime/documentary/sport/racing genre presets +
trained style LoRAs), VOICES (character/narrator/announcer), MUSIC/SFX (genre score +
palette). Domain-aware IMPORT (movie/tv/anime/documentary/racing/sport) with dataset prep,
the right trainer, and — critically — RIGHTS CONSENT (own/licensed only; no platform
repurposing; no brand replication). The subcategories are the user's palette; the
orchestrator composes from it per project genre.
