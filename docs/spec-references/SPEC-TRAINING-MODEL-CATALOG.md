# SPEC — TRAINING MODEL CATALOG (verified FAL trainers + LoRA-inference endpoints)
# The open-weight/LoRA training + inference ecosystem on FAL, per family. All serverless
# (FAL_KEY, no GPU infra). Trainer → .safetensors + config → apply on the /lora inference
# endpoint. ⚠ Verify every endpoint via OpenAPI before wiring (free):
#   GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>
# Per-model docs: https://fal.ai/models/<endpoint-id>/llms.txt (agent-readable schema)

═══════════════════════════════════════════════════════════════════════
# THE PATTERN (every trainer)
═══════════════════════════════════════════════════════════════════════
1. Dataset: a .zip (images and/or videos and/or audio) + paired .txt captions (same
   basename) + a trigger phrase. Upload via fal.storage → a data_url.
2. Trainer endpoint (gated FAL call, ~$0.005/step; queue+webhook, long-running).
3. Output: lora_file (.safetensors) + config_file (JSON: trigger phrase = instance_prompt
   + training_type). Store as the user's asset.
4. Inference: the matching /lora endpoint, pass the LoRA weights URL + trigger phrase in
   the prompt. The trained subject/style is summoned.

═══════════════════════════════════════════════════════════════════════
# VIDEO TRAINERS + LoRA INFERENCE (character/style/motion — the core)
═══════════════════════════════════════════════════════════════════════

## MINIMAX H3 (Hailuo-03) — ⚠ THE BEST video-LoRA family (verified, 3 modes)
Open-weight ~33B video+audio. Trains on VIDEO + AUDIO + reference images. THREE trainers,
THREE matching LoRA-inference endpoints — the richest video-LoRA on FAL:
TRAINERS:
- minimax/h3/t2v/trainer — text-to-video-audio LoRA (subject/character/style; joint
  video+audio training — clips with audio teach the sound too, automatic per-clip).
- minimax/h3/ref2va/trainer — reference-to-video-audio LoRA (⚠ THE CONSISTENCY ONE:
  trains reference-conditioning in, reference_conditioning_p default 0.9 — strengthens
  keeping YOUR subject consistent from reference images. Best for character/cast LoRAs.)
- (i2v trainer — verify)
LoRA INFERENCE (verified):
- minimax/h3/text-to-video/lora   | minimax/h3/image-to-video/lora
- minimax/h3/reference-to-video/lora  (prompt refs as "Image 1, Video 1, Audio 1")
  pricing: $0.10/s 768p, $0.1625/s 2K, $0.20/s 4K.
NOTE: ONE H3 LoRA works across t2v/i2v/r2v (it touches shared attention projections).
⚠ RECOMMEND H3 as the PRIMARY training target for CAST (character consistency) — ref2va
trainer is purpose-built for it, and H3 is native audio + high quality.

## WAN — video LoRA (verified)
- fal-ai/wan-trainer — Wan 2.1 I2V 480p video LoRA (images and/or videos, 10+, optional
  captions). $0.005/step. Output LoRA → apply on Wan i2v-with-LoRA inference (verify id).
- Wan-Animate-2 (motion transfer: reference image + driving video → character does the
  motion) — relevant for motion consistency (verify fal endpoint).
- fal-ai/wan-22-image-trainer — Wan 2.2 TEXT-TO-IMAGE LoRA (subjects/styles, trigger phrase).

## LTX-2 — video LoRA (verified — 30-min training)
- LTX-2 Video Trainer — fine-tune LTX-2 video via API in 30 min. Upload 10-50 videos
  (target style/motion) + LoRA rank + steps → weights for LTX-2 inference.
- fal-ai/ltx-2.3 trainer — "Train LTX-2.3 22B for custom styles and effects".
- LTX-2.3 image-to-video trainer — "fine-tune to animate a starting image".
LoRA INFERENCE (verified):
- ltx-2-19b/audio-to-video/lora  | ltx-2-19b/distilled/audio-to-video/lora
- ltx-2-19b/distilled/video-to-video/lora  (audio+video+image → video with custom LoRA)

═══════════════════════════════════════════════════════════════════════
# IMAGE TRAINERS + LoRA INFERENCE (references/keyframes/styles — feed the video pipeline)
═══════════════════════════════════════════════════════════════════════

## FLUX.2 — the deepest image-LoRA family (verified — trainers + inpaint + i2i + edit)
TRAINERS:
- Fine-tune FLUX.2 [dev] with custom datasets → LoRA adaptations for editing tasks.
- Fine-tune FLUX.2 [klein] 9B → specialized LoRA adaptations.
- flux-lora-portrait-trainer — FLUX LoRA optimized for PORTRAITS (faces — great for CAST
  reference sheets). flux-lora-fast-trainer — blazing-fast subjects/styles.
LoRA INFERENCE (the tools Neo listed — verified):
- flux-2/klein/9b/base/edit/lora — IMAGE-TO-IMAGE editing w/ LoRA (style transfer). ✅ i2i
- FLUX.1 Kontext [dev] w/ LoRA — rapid image editing w/ pre-trained LoRA.
- flux-2-lora-gallery/<style> — a GALLERY of ready style LoRAs (e.g. sepia-vintage) — the
  PRESET STYLE mechanism (pick a gallery LoRA, no training).
- ⚠ LoRA INPAINT + LoRA i2i: confirm the flux inpaint-with-LoRA endpoint id via OpenAPI.
- FLUX 3 — frontier VIDEO model (image→video). + FLUX SATELLITE/geo view (Neo's note —
  verify the exact flux geo/satellite endpoint id; likely a flux-2 gallery or a geo model).

## OTHER IMAGE TRAINERS (styles/subjects for references + keyframes)
- Ideogram V4 LoRA trainer; Recraft V3 Create Style; Z-Image base+lora; Krea 2; GPT-Image-2.
- Phota — profiles from 30-50 images of a subject (character reference generation).

═══════════════════════════════════════════════════════════════════════
# AUDIO TRAINERS + INFERENCE (music/SFX styles + voices)
═══════════════════════════════════════════════════════════════════════

## STABLE AUDIO 3 — LoRA trainer (verified — music/SFX style)
- fal-ai/stable-audio-3-trainer — fine-tune on paired audio-caption datasets → LoRA for a
  custom music style / sound palette / domain. Dataset: .zip (audio_data_url) of WAV/FLAC/
  MP3/OGG/OPUS/AIFF (4-2000 clips) + a .txt caption per clip. $3/1000 steps.
- Inference: the Stable Audio 3 /lora endpoints (load the .safetensors). ⚠ verify ids.
- Use: custom score/SFX styles per project (documentary ambience, action stingers, etc.).

## ELEVENLABS FAMILY ON FAL (verified — the audio stack, on FAL_KEY)
ElevenLabs is on FAL — research confirmed multiple endpoints:
- TTS: ElevenLabs TTS Multilingual v2 (multilingual speech); TTS Turbo v2.5 (fast).
- MUSIC: ElevenLabs Music (high-quality music w/ fine controls).
- FORCED ALIGNMENT: align a transcript to an audio recording (word timing — for lipsync).
- (verify: voice clone / voice design / SFX endpoints on FAL vs the direct ElevenLabs API)
So ElevenLabs voice + music + alignment can run on the FAL key (one key). ⚠ Confirm which
ElevenLabs endpoints are on FAL (TTS/music/alignment confirmed) vs direct-API-only (clone/
design may need the direct ElevenLabs API — verify). VOICES for the training studio can
use ElevenLabs clone (direct or FAL) + MiniMax voice-clone.

═══════════════════════════════════════════════════════════════════════
# UTILITY (segmentation — supports masking/roto/compositing, not a video model)
═══════════════════════════════════════════════════════════════════════
## SAM 3 (verified — segmentation)
- fal-ai/sam-3/image-rle — segment + track objects; text/visual prompts, point/box/mask
  inputs. $0.005/unit (free preview). RLE mask output.
- SAM 3D — 3D reconstruction from an image (objects + Body/SMPL for character rigs).
USE: masking for VFX/roto (the compositor), subject isolation for training-data prep
(clean a subject before training a LoRA), object tracking. NOT a generation model — a
UTILITY the pipeline + training-data-prep uses. Pairs with the RAG/reference selection.

═══════════════════════════════════════════════════════════════════════
# WHAT GOES IN THE TRAINING STUDIO (mapping to the sidebar)
═══════════════════════════════════════════════════════════════════════
- CAST (character LoRA) → MiniMax H3 ref2va trainer (PRIMARY — consistency) + Wan-trainer
  + flux-portrait-trainer (for the reference sheet). H3 LoRA works across t2v/i2v/r2v.
- STYLE LoRA → H3 t2v trainer / LTX-2 video trainer (video style) + FLUX.2 trainer / Wan
  2.2 image trainer (image style). Plus the flux-2-lora-gallery presets (no-train styles).
- VOICE → ElevenLabs clone/design (FAL or direct) + MiniMax voice-clone.
- MUSIC/SFX STYLE → Stable Audio 3 trainer + ElevenLabs Music.
- DATA PREP → SAM 3 (isolate the subject from training footage before training).

## NET
FAL has a DEEP serverless training ecosystem: MiniMax H3 (best video-LoRA — 3 trainers,
ref2va for consistency, one LoRA across t2v/i2v/r2v), Wan + LTX-2 video trainers, FLUX.2
image-LoRA (train + inpaint + i2i + edit + a style gallery), Stable Audio 3 (audio-style
LoRA), ElevenLabs (voice/music/alignment on FAL), SAM 3 (segmentation utility). ALL
serverless on FAL_KEY, ~$0.005/step (Stable Audio $3/1000). This is the model layer for
the Training Studio. Verify every endpoint via OpenAPI + the per-model llms.txt.

═══════════════════════════════════════════════════════════════════════
# THE ORCHESTRATOR DIRECTS THE TRAINING HANDOFF (Neo's #2)
═══════════════════════════════════════════════════════════════════════
The orchestrator delegates TRAINING as well as generation. On a training submission, it
picks the correct trainer, assembles the dataset in that trainer's format, and hands off
to FAL. Its model knowledge (OR-02 RAG) extends to TRAINER endpoints, not just generation.

## TRAINER SELECTION (the orchestrator's training delegation)
```typescript
function selectTrainer(assetType, dataset): TrainerDef {
  switch (assetType) {
    case 'character':  // consistency is the point → H3 ref2va (reference-conditioned)
      return dataset.hasVideo ? H3_ref2va : (dataset.hasVideo ? WAN_trainer : FLUX_portrait)
    case 'asset':      // object consistency → same as character (ref2va / image trainer)
      return dataset.hasVideo ? H3_ref2va : FLUX2_dev
    case 'style':      // look → H3_t2v (video style) / LTX2 (motion) / FLUX2 (image style)
      return dataset.hasVideo ? (LTX2_video | H3_t2v) : FLUX2_dev
    case 'voice':      // ElevenLabs / MiniMax clone (not a LoRA trainer — a clone flow)
      return VOICE_clone
    case 'audio_style':return STABLE_AUDIO_3_trainer
  }
}
// The orchestrator KNOWS (from the catalog + OR-02 RAG) which trainer fits — it reasons
// "consistent character → ref2va feeds reference images + video clips + captions".
```

## DATASET ASSEMBLY PER TRAINER (feed the RIGHT inputs in the RIGHT format)
The orchestrator assembles the dataset in the FORMAT the chosen trainer expects:
- H3 ref2va (character/asset): REFERENCE IMAGES (conditioned in) + video clips + per-clip
  captions + trigger phrase. Feed the references as the ref-condition inputs.
- H3 t2v / LTX-2 / Wan (style/motion): VIDEO clips + captions + trigger. (Style = varied
  clips of the look; motion = clips of the movement.)
- FLUX.2 / portrait (image style/character sheet): STILL images + captions + trigger.
- Stable Audio 3: AUDIO clips + per-clip .txt captions.
- Voice: an audio sample (≥10s) → clone flow (not a zip-trainer).
So the orchestrator ROUTES the user's uploaded references/videos/images/audio to the
correct trainer with the correct dataset shape — the user just adds media; the
orchestrator handles the training handoff to FAL.

## THE HANDOFF FLOW (orchestrator → FAL training pipeline)
```
user submits (media + type + description) in the sidebar →
ORCHESTRATOR: selectTrainer(type, dataset) → assembleDataset(format) → confirm cost →
gatedRunFal(trainer.id, dataset, {source:'training.'+type}) → queue/webhook →
store the LoRA asset → it becomes a routable generation option.
```
The orchestrator is informed about the WHOLE FAL ecosystem — generation AND training. It
directs the right training the way it directs the right generation: by knowing each
endpoint's purpose and feeding it the correct inputs.

## NET (handoff)
On a training submission, the orchestrator selects the correct trainer for the asset type
(character→H3 ref2va, style→LTX2/H3-t2v, asset→ref2va/FLUX2, voice→clone, audio→Stable
Audio 3), assembles the dataset in that trainer's format (references/videos/images/audio +
captions + trigger), and hands off to FAL (gated, cost-confirmed). Its knowledge (OR-02
RAG) covers trainers, not just generators — it orchestrates training as it orchestrates
generation.
