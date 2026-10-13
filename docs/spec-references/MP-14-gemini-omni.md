# MP-14 — GEMINI OMNI FLASH family (Google — the PRIMARY Google model, leads Veo).
# CURSOR PROMPT. Obey INV-1..8 + MP-00. Reference: FAMILY-11-gemini-omni.md (fully verified).
# ⚠ Verify every endpoint via OpenAPI + fal.ai/models/google/gemini-omni-flash/v1.1/*/llms.txt.

## STATUS: Omni 1.1 Flash = Arena #1 text-to-video (leads Veo ~150 Elo). Google's flagship.
## On FAL: 4 endpoints + 2 sub-models. Veo KEPT as secondary (4K + long takes only).

## TASK 1 — VERIFY the 4 endpoints + 2 sub-models (OpenAPI + llms.txt)
[ ] google/gemini-omni-flash/v1.1/text-to-video    (Arena #1; + optional 7 imgs, ref video, 3 voices, 3 char IDs)
[ ] google/gemini-omni-flash/v1.1/image-to-video   (⚠ keyframes: start_image_url + OPTIONAL end_image_url → covers first_frame AND first_last)
[ ] google/gemini-omni-flash/v1.1/reference-to-video (7 images + up to 3 ref VIDEOS ⚠3s max each; <IMAGE_REF_0>/<VIDEO_REF_0> tags)
[ ] google/gemini-omni-flash/v1.1/edit             (⚠ VIDEO EDIT — unique; { prompt, video_url })
[ ] SUB-MODELS: gemini-omni-audio (voice profiles ≤3) + gemini-omni-character (char IDs ≤3) — verify ids
[ ] (optional) the UNIFIED 1.1 endpoint folding all inputs into one call — verify if on fal

## TASK 2 — REGISTRY entry (per FAMILY-11)
Add 'gemini-omni' with the 4 mode endpoints:
  text → text-to-video ; first_frame + first_last → image-to-video (start + optional end) ;
  reference → reference-to-video ; video_edit → edit.
Fields: references tag = <IMAGE_REF_N>/<VIDEO_REF_N> (0-indexed), maxImages:7, maxRefVideos:3,
refVideoMaxSecs:3, voiceProfiles:3, characterIds:3. firstFrame:'start_image_url',
lastFrame:'end_image_url'. duration 3-10. aspect 16:9/9:16. nativeAudio:true.
⚠ perSecondBilling by resolution (NOT token — that was muapi's framing); audio never charged.
Flags: videoEditCapable, voiceIdCapable, characterIdCapable, maxResolution:'4k'.

## TASK 3 — PAYLOAD branches
- text → { prompt, + optional reference_images[]≤7, ref video, voice ids≤3, char ids≤3 }
- first_frame → { prompt, start_image_url } ; first_last → { prompt, start_image_url, end_image_url }
- reference → { prompt (with <IMAGE_REF_0> tags), image_urls[]≤7, video_urls[]≤3 (3s each) }
- video_edit → { prompt (instruction), video_url }  ⚠ preserves motion+timing
composePrompt for Omni reference: inject <IMAGE_REF_0>/<VIDEO_REF_0> tags binding refs to roles.

## TASK 4 — COST (per-second by resolution) + ROLE
- Cost estimate: per-second × resolution tier (standard, not token). audio free. edit bills
  the returned video seconds ($0.048+/s).
- ROLE: Omni = PRIMARY quality t2v + richest reference + video-edit + start/end keyframes.
  Its Audio+Character sub-models = a GOOGLE-NATIVE consistency+voice stack (alt to Seedance+
  ElevenLabs). Veo = SECONDARY (4K + long takes only). Route: quality t2v → Omni; reference/
  consistency → Omni/Seedance/Wan3 (compare+learn); video-edit → Omni; 4K/long → Veo.
- i2v note: on Arena i2v, Hailuo H3 #1, Omni #2, Veo #11 — test H3+Omni for i2v shots.

## TASK 5 — SUB-MODELS (Omni Audio + Character → Training Studio + consistency)
- gemini-omni-character (char IDs ≤3) → pairs with the Cast system: a Google-native
  character-ID for consistency, summoned in the video endpoints.
- gemini-omni-audio (voice profiles ≤3) → a VOICE asset source (Training Studio voices),
  used natively in Omni's generation pass (in-pass audio, no separate lip-sync for Omni shots).

## TASK 6 — TEST each mode (validate, one gen). Confirm <IMAGE_REF_0> tags, keyframes,
video-edit, per-second cost. Veo NOT removed (secondary). tsc + check:chokepoints green.
