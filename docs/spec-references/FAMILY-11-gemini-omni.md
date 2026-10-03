# MODEL FAMILY — GEMINI OMNI FLASH (Google DeepMind, on FAL) — VERIFIED
# Prefix: google/gemini-omni-flash/... (use v1.1). Use @fal-ai/client + FAL_KEY.
# ⚠ OMNI NOW LEADS VEO (corrected, Aug 2026): Gemini Omni 1.1 Flash launched Aug 27 2026
# and took #1 on Arena text-to-video next day — leads Veo 3.1 by ~150 Elo (1515 vs 1364).
# Google built Omni as the go-forward flagship (technically descended from Veo). Omni is
# Google's PRIMARY model now; Veo drops to SECONDARY (kept for 4K + long takes only).
# Verify via OpenAPI.

## STATUS (verified Sept 2026 — Omni leads)
- Omni GA on API Aug 27 2026; #1 Arena text-to-video (1515 Elo) — LEADS Veo (1364) by ~150.
- Richer refs than Veo: 7 images + 3 named characters (vs Veo's 3 images). Start+end keyframes.
- ONLY Google model that EDITS an existing video (google/gemini-omni-flash-1.1-video-edit).
- i2v Arena: Hailuo H3 #1 (1494), Omni #2 (1488), Veo #11 (1398) — test H3+Omni for i2v.
- Consumer app: Omni replaced Veo. API/FAL: BOTH live — Omni PRIMARY, Veo secondary (4K/long).
- On FAL as google/gemini-omni-flash/v1.1/* (+ the video-edit endpoint).

═══════════════════════════════════════════════════════════════════════
# THE COMPLETE FAMILY — 4 endpoints + 2 associated sub-models (verified fal docs)
═══════════════════════════════════════════════════════════════════════
Prefix: google/gemini-omni-flash/v1.1/... (all four run through ONE @fal-ai/client).
Billing: PER SECOND of output, by resolution, SAME rate across all 4 (audio never
charged separately). Edit bills on the RETURNED video's length. ~$0.10/s → higher at 4K.
(Note earlier "token billing" was muapi's framing — on FAL it's per-second by resolution.)

### 1. TEXT-TO-VIDEO — google/gemini-omni-flash/v1.1/text-to-video
- The Arena #1 t2v. payload: { prompt (req), + OPTIONAL: reference_images[] (up to 7,
  auxiliary conditioning), a short reference video, up to 3 VOICE profiles (Omni Audio),
  up to 3 CHARACTER refs (Omni Character) }. Native synced dialogue+ambient+music in one pass.
- camera/pacing/audio/negatives in the prompt (natural language). 720p–4K.

### 2. IMAGE-TO-VIDEO (keyframes) — google/gemini-omni-flash/v1.1/image-to-video
- Controlled transition from a START keyframe + OPTIONAL END keyframe. 4K delivery.
- payload: { prompt, start_image_url (req), end_image_url? }  — this IS the first_frame
  AND first_last mode (start + optional end). Physics-grounded, native audio.

### 3. REFERENCE-TO-VIDEO — google/gemini-omni-flash/v1.1/reference-to-video
- Multimodal composition: up to 7 reference IMAGES + up to 3 short reference VIDEO clips
  (⚠ 3 SECONDS max per ref video — a real constraint) + text. Tag-addressed.
- ⚠ REFERENCE TAGS: <IMAGE_REF_0>, <VIDEO_REF_0> in the prompt (0-indexed). e.g.
  "A cat inspired by <IMAGE_REF_0> walks through <VIDEO_REF_0>."
- Reasons across all inputs → one coherent result; face/clothing/voice retained.

### 4. VIDEO EDIT (video-to-video) — google/gemini-omni-flash/v1.1/edit
- ⚠ UNIQUE — no other Google model edits an uploaded video. A one-line instruction
  ("Make this anime, keep everything else") restyles/relights/transforms/rewrites-dialogue
  while PRESERVING motion + timing, carrying character+scene consistency across successive
  edits. payload: { prompt (instruction), video_url (req, mp4/mov/webm/m4v/gif) }.
- Bills on the SOURCE/returned video seconds (3–10s range), cheaper per-sec ($0.048+).

### THE UNIFIED 1.1 ENDPOINT (optional — folds all inputs into one call)
- Gemini Omni 1.1 Flash can be a SINGLE endpoint taking text + 7 images + first/last
  keyframes + a reference video + 3 voices + 3 character IDs in ONE call (per muapi;
  VERIFY the unified endpoint id on fal — the 4 focused endpoints above are confirmed on fal).

═══════════════════════════════════════════════════════════════════════
# ASSOCIATED SUB-MODELS (the Omni ecosystem — reusable profiles)
═══════════════════════════════════════════════════════════════════════
- GEMINI OMNI AUDIO — creates reusable VOICE PROFILES (up to 3 per generation). A voice
  the video endpoints summon by ID → consistent character voice across shots. ⚠ VERIFY
  the fal endpoint id. This is a VOICE asset source for the Training Studio (voices tab).
- GEMINI OMNI CHARACTER — creates reusable CHARACTER references/IDs (up to 3 per gen). A
  character identity the video endpoints summon by ID → consistency. ⚠ VERIFY fal id.
  This pairs with the Cast/character system — Omni's native character-ID consistency.
→ These two make Omni a SELF-CONTAINED consistency stack: Omni Character (identity) +
  Omni Audio (voice) + the video endpoints (generation), all Google-native. A strong
  alternative to the Seedance/ElevenLabs combo for character consistency + voice.

## KEY FACTS
- native synchronized AUDIO; VOICE retention (voice-ID-like across refs).
- 3-10s durations (Flash tier — SHORT, like the OTHER short models; not Veo's long takes).
- aspect 16:9 / 9:16 only. camera control via natural-language prompt.
- TOKEN BILLING: input $1.875/M, output $21.875/M (~$0.13/s 720p). ⚠ token-based, not
  per-second — cost scales with input complexity (many refs = more input tokens).
- world-understanding / physics grounding (Gemini reasoning) — good prompt adherence.
- @fal-ai/client (NOT serverless-client).

## ROLE IN THE POOL (Omni PRIMARY Google model — leads Veo)
- OMNI = PRIMARY quality text-to-video (Arena #1) + richest multimodal reference (7 img +
  3 named characters) + video EDITING + start/end keyframes. The go-to for quality t2v AND
  reference/composition/consistency (face/clothing/voice retained). Strong CONSISTENCY model.
- VEO 3.1 = SECONDARY now — kept ONLY for its remaining edges: native 4K (upscale) + LONG
  takes (140s via Extend). For 4K hero shots + long single takes, use Veo; else Omni beats it.
- ROUTING: quality t2v → Omni (leads). Reference/consistency → Omni / Seedance / Wan3 (compare
  + learn; Omni's 7-img+3-char is strong). Video edit → Omni (only Google option). 4K/long → Veo.
- ⚠ ADD the video-edit mode: google/gemini-omni-flash-1.1-video-edit (Omni edits an uploaded
  video — a capability Veo lacks; wire as the video_edit mode for this family).

## REGISTRY SHAPE (mode-aware, per FAMILY-INDEX)
```typescript
'gemini-omni': { provider:'fal', endpoints: {
  text:       'google/gemini-omni-flash/v1.1/text-to-video',      // Arena #1 t2v
  first_frame:'google/gemini-omni-flash/v1.1/image-to-video',     // start_image_url
  first_last: 'google/gemini-omni-flash/v1.1/image-to-video',     // start + end_image_url
  reference:  'google/gemini-omni-flash/v1.1/reference-to-video', // 7 img + 3 ref-videos (3s each)
  video_edit: 'google/gemini-omni-flash/v1.1/edit',               // ⚠ edits an uploaded video (Veo can't)
},
subModels: { audio:'gemini-omni-audio (voice profiles, ≤3)', character:'gemini-omni-character (IDs, ≤3)' },
fields: {
  firstFrame:'image_url',
  references:{ mode:'prompt_tag', tag:'<IMAGE_REF_N>', videoTag:'<VIDEO_REF_N>',
               maxImages:7, maxRefVideos:3, refVideoMaxSecs:3,  // ⚠ 3s max per ref video
               voiceProfiles:3, characterIds:3 },  // Omni Audio voices + Omni Character IDs
  firstFrame:'start_image_url', lastFrame:'end_image_url',  // i2v = start + optional end
  duration:{ field:'duration', kind:'number', min:3, max:10 },
  audio:{ field:'', kind:'native_always' },
  aspect:{ field:'aspect_ratio', values:['16:9','9:16'] },
},
limits:{ maxPromptChars:/*verify*/ 2000, durationMin:3, durationMax:10 },
nativeAudio:true, perSecondBilling:true, maxResolution:'4k',  // per-sec by res, audio free
videoEditCapable:true, voiceIdCapable:true, characterIdCapable:true,
}
```

## TODO ON WIRE (verify via OpenAPI + fal.ai/models/google/gemini-omni-flash/v1.1/*/llms.txt)
[ ] all 4 endpoints confirmed on fal: text-to-video, image-to-video (keyframes),
    reference-to-video, edit. Verify each schema.
[ ] ref tags <IMAGE_REF_0>/<VIDEO_REF_0> (0-indexed); 7 images + 3 ref videos (3s each max).
[ ] i2v = start_image_url + optional end_image_url (this covers first_frame AND first_last).
[ ] video EDIT (/v1.1/edit): a UNIQUE capability — wire as video_edit; { prompt, video_url }.
[ ] Omni AUDIO + Omni CHARACTER sub-models: verify fal endpoint ids — voice profiles + char
    IDs (≤3 each) → a Google-native consistency+voice stack (Training Studio voices/cast).
[ ] BILLING is per-second by resolution (NOT token-based — that was muapi's framing). audio free.
[ ] on FAL (google/ namespace) — FAL client, not the direct Gemini API.
