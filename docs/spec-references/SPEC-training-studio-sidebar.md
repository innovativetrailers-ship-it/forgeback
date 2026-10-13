# SPEC — TRAINING STUDIO (sidebar): LoRA styles, cast, voices — trainable user assets
# A sidebar surface where the user builds their own TRAINED assets: style LoRAs (genre
# presets + custom), character/cast LoRAs, and voices — from videos, images, descriptions.
# Trained serverlessly on FAL (no local infra). Trained assets become ROUTABLE options
# the orchestrator delegates to (SPEC-orchestrator). Obey INV-1..8. ⚠ Verify all FAL
# trainer/inference endpoints via OpenAPI before wiring.

═══════════════════════════════════════════════════════════════════════
# THE SIDEBAR — asset types (each trainable)
═══════════════════════════════════════════════════════════════════════
A "Training" / "Assets" sidebar panel with tabs:
1. STYLES   — style LoRAs + genre presets (the look)
2. CAST     — character LoRAs (identity/consistency)
3. VOICES   — cloned/designed voices (per character)
Each asset: takes VIDEOS + IMAGES + DESCRIPTION as input; trains on FAL serverless;
becomes a reusable, routable asset. Stored per user (their own data — privacy rules).

═══════════════════════════════════════════════════════════════════════
# STYLE — two layers: instant PRESETS + optional trained LoRAs
═══════════════════════════════════════════════════════════════════════
⚠ KEY DISTINCTION (mirrors RAG-vs-training): a style PRESET conditions loosely (instant,
free); a style LoRA locks the look in (trained, ~$5, minutes). Offer BOTH.

## GENRE PRESETS (instant — prompt + grade + camera defaults, NO training)
Shipped presets, each = a bundle of { style prompt language, color-grade params, camera
defaults, pacing hints } applied at generation:
- BLOCKBUSTER: Action | Sci-Fi | Drama | Romance | Comedy
- DOCUMENTARY: History | Science | Political
Each preset seeds composePrompt's style fragment + the color grade + camera bias.
Selecting one = instant style, no cost. (These are the SPEC-08 style_key presets, expanded.)

## TRAIN A STYLE LORA (optional upgrade — locks the look in)
- User picks a genre preset AS A SEED, OR uploads their own footage (a filmmaker's films
  — ties to SPEC-style-memory-rag), + a description/trigger phrase.
- Trains on FAL: fal-ai/wan-trainer (video LoRA) or fal-ai/wan-22-image-trainer / LTX-2.3
  trainer (verify current best). ~$0.005/step (1000 steps ≈ $5). Serverless, no infra.
- Output: LoRA weights (safetensors) + config → stored as a StyleLora asset.
- The trained LoRA is applied at inference on the matching LoRA-capable endpoint → the
  style is LOCKED IN, stronger than the preset.
So: genre presets = instant loose style; trained LoRA = locked style (the user's or a
genre trained harder). The user chooses per project.

═══════════════════════════════════════════════════════════════════════
# CAST — character LoRAs (trained identity/consistency)
═══════════════════════════════════════════════════════════════════════
- User uploads images + videos of a character + a description/trigger phrase (in the
  Cast tab; ties to the existing VaultCharacter).
- Trains a character LoRA on FAL serverless (wan-trainer takes video → motion+appearance).
- Output: character LoRA → attached to the VaultCharacter (alongside referenceUrls + seed
  + voiceId). Now the character has THREE consistency mechanisms, strongest to weakest:
  1. trained LoRA (locked identity) 2. reference images (RAG conditioning) 3. seed.
- The orchestrator, for a consistency shot with this character, can route to a LoRA-
  capable endpoint WITH the character's LoRA → the strongest consistency available.
- This is the "trained consistency without local infra" path — the RAG-vs-training
  endgame delivered serverlessly.

═══════════════════════════════════════════════════════════════════════
# VOICES — cloned/designed (per character)
═══════════════════════════════════════════════════════════════════════
- User uploads a voice sample (≥10s) → clone via ElevenLabs / MiniMax voice-clone →
  a stored Voice asset with a voiceId.
- OR describe a voice → Voice Design (ElevenLabs) → generated voice.
- Attached to a VaultCharacter (voiceId). Used for dialogue: native-audio models
  (@Audio/voice-ID) OR the ElevenLabs lip-sync pass.
- (This mostly EXISTS — surface it in the sidebar as a first-class trainable asset.)

═══════════════════════════════════════════════════════════════════════
# THE TRAINING FLOW (FAL serverless — no infra)
═══════════════════════════════════════════════════════════════════════
```
1. User adds videos/images + description (+ optional genre-preset seed) in the sidebar.
2. Zip the training set → upload (fal.storage) → submit to the trainer endpoint:
   - style/cast video LoRA: fal-ai/wan-trainer (training_data_url, number_of_steps)
   - style image LoRA: fal-ai/wan-22-image-trainer (trigger_phrase)
   - (verify current best trainers + resolutions via OpenAPI)
3. Poll via QUEUE + WEBHOOK (training is long — don't block). Show progress in the sidebar.
4. On complete: store { loraUrl (safetensors), configUrl } as the asset (StyleLora /
   CharacterLora). Gated (INV-1 — training is a PAID FAL call; ~$0.005/step).
5. The asset is now selectable in the project + routable by the orchestrator.
```
COST: shown up front (steps × $0.005; ~$5 for 1000). Training is a deliberate, priced
action (like a generation) — surface the cost, confirm before submitting.

═══════════════════════════════════════════════════════════════════════
# HOW TRAINED ASSETS FEED THE PIPELINE + ORCHESTRATOR
═══════════════════════════════════════════════════════════════════════
- A trained LoRA is applied at INFERENCE on a LoRA-capable endpoint (pass loraUrl in the
  payload — verify the field per endpoint). buildPayload gains a lora field for LoRA-
  capable models.
- The orchestrator's DELEGATION (OR-03): a consistency shot with a character that HAS a
  trained LoRA → prefer the LoRA-capable endpoint with the LoRA (strongest consistency).
  A styled project with a trained style LoRA → apply it on the styled shots.
- The model-knowledge RAG (OR-02) knows which endpoints are LoRA-capable (a tool-matrix
  dimension). Delegation routes LoRA-needing shots to them.
- LEARNING (OR-04/05): rate LoRA'd shots → the orchestrator learns whether the trained
  asset improved consistency (it should) → weights future routing.

═══════════════════════════════════════════════════════════════════════
# WHAT TO BUILD
═══════════════════════════════════════════════════════════════════════
1. Sidebar panel: Styles / Cast / Voices tabs; each with add (videos+images+description),
   train (with cost confirm), and a list of the user's trained assets.
2. Genre presets (instant): the blockbuster/documentary style bundles (prompt+grade+camera)
   — extend SPEC-08 style_key. Selectable per project, no training.
3. Training flow: zip → fal.storage upload → trainer endpoint (gated) → queue/webhook →
   store {loraUrl, configUrl} as the asset. Verify the current best FAL trainers.
4. Asset entities: StyleLora, CharacterLora (on VaultCharacter), Voice (on VaultCharacter).
   Additive schema (INV-7), stored per user (privacy).
5. Inference wiring: buildPayload lora field for LoRA-capable endpoints; orchestrator
   delegates LoRA-needing shots to them (OR-02/03).
6. Cost UX: training cost shown + confirmed before submit; progress in the sidebar.

## ACCEPTANCE
[ ] the sidebar has Styles/Cast/Voices; each adds videos+images+description.
[ ] genre presets (blockbuster/documentary) apply an instant style (prompt+grade), no cost.
[ ] training a style/cast LoRA: zip → FAL trainer (gated, cost-confirmed) → queue/webhook →
    stored asset with loraUrl.
[ ] a trained character LoRA attaches to the VaultCharacter; a consistency shot routes to
    a LoRA-capable endpoint WITH the LoRA.
[ ] a voice clones/designs → attaches to a character → used for dialogue.
[ ] training is a gated paid FAL call with cost shown + confirmed (INV-1).
[ ] assets stored per user (privacy/consent).
[ ] tsc + check:chokepoints green.

## NET
A Training Studio sidebar: instant genre STYLE presets (blockbuster/documentary — prompt+
grade, free) PLUS optional trained STYLE LoRAs (locked look), trained CAST LoRAs (locked
identity — the strongest consistency, serverless, no infra), and VOICES. Trained on FAL
serverless (~$5/LoRA, gated). Trained assets become routable options the orchestrator
delegates to for consistency/style. This is "train your own" — the studio moat + the
trained-consistency endgame, delivered without local infrastructure, in the sidebar.

═══════════════════════════════════════════════════════════════════════
# DATA, RIGHTS & THE BUSINESS MODEL (design this in, not bolt on)
═══════════════════════════════════════════════════════════════════════
The legitimate business advantage — captured WITHOUT the legal/trust liability.

## WHAT THE PLATFORM LEGITIMATELY GAINS (keep these)
- USER-FUNDED TRAINING — the training bill is the user's (steps × $0.005). Margin-positive
  feature, not a cost center. Sound unit economics.
- STICKINESS — a user's trained assets (styles/cast/voices) live in their library on the
  platform → deep retention. A real moat.
- AGGREGATE OUTCOME DATA — which genres/routes/shot-types perform + the ratings (OR-04/05).
  This is the ASSET: anonymised, behavioural, disclosed in ToS, and it makes the
  orchestrator smarter for everyone. Optimise for THIS.

## WHAT THE PLATFORM MUST NOT DO (the liability — do NOT harvest training CONTENT)
Users' UPLOADED TRAINING MATERIAL (character footage, films, faces, voices) is NOT a
platform asset to repurpose. Do NOT train the platform's own models on it, build datasets
from it, or retain it beyond providing THAT user's service. Reasons:
1. LEGAL — the content is often not the user's to license to you (studio footage, an
   actor's likeness, a person's voice). Repurposing exposes you to IP + publicity/likeness
   claims + BIOMETRIC law (faces/voices are specially protected: BIPA, GDPR, etc.).
2. TRUST + MOAT — the studio/BYO pitch IS "your footage never leaves your control, your IP
   stays yours". Harvesting the content DESTROYS that exact differentiator. Don't undercut
   your moat for a data grab.
3. WRONG DATA — the valuable signal is the OUTCOME (which model worked for which shot),
   not the raw footage. Outcomes are yours to use; footage is liability. Get the outcome.

## THE RULE (design requirement)
- Training CONTENT = a liability held ON THE USER'S BEHALF to provide their service. Store
  it only as long as needed, honour deletion, encrypt, don't repurpose. The trained LoRA +
  the content are the USER'S assets.
- OUTCOME/USAGE DATA = the platform's asset (aggregate, anonymised, ToS-disclosed) → feeds
  the orchestrator's learning. This is what "reap the data" should mean — legitimately.
- CONSENT — the ToS discloses aggregate outcome-data use for product improvement; it does
  NOT claim rights to repurpose training content. Voices/faces get explicit consent
  (biometric law). Deletion removes the content + the trained asset on request.

## NET
Keep the legitimate wins — user-funded training (margin), asset stickiness (retention),
aggregate outcome data (the orchestrator's learning asset). Do NOT harvest users' training
CONTENT (legal + biometric liability, and it destroys the "your IP stays yours" moat). The
asset is the OUTCOMES, not the footage. Design privacy/consent/retention/deletion in from
the start.
