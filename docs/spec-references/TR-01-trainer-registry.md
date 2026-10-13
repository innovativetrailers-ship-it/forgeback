# TR-01 — TRAINER + LoRA-INFERENCE REGISTRY. CURSOR PROMPT. Obey INV-1..8 + TR-00.
# Reference: SPEC-TRAINING-MODEL-CATALOG (verified endpoints). Index the FAL training +
# LoRA-inference ecosystem. ⚠ Verify EVERY id via OpenAPI + fal.ai/models/<id>/llms.txt.

## TASK 1 — VERIFY the trainer + inference endpoints (OpenAPI + llms.txt each)
VIDEO (character/style/motion):
[ ] minimax/h3/t2v/trainer + minimax/h3/ref2va/trainer  (⚠ ref2va = the consistency trainer)
[ ] minimax/h3/text-to-video/lora + image-to-video/lora + reference-to-video/lora (inference)
[ ] fal-ai/wan-trainer (video LoRA) + Wan LoRA-inference endpoint (verify) + wan-22-image-trainer
[ ] LTX-2 video trainer + fal-ai/ltx-2.3 trainer + ltx-2-19b/*/lora inference endpoints
IMAGE (references/keyframes/styles):
[ ] flux-lora-portrait-trainer + flux-lora-fast-trainer + FLUX.2 [dev]/[klein] trainers
[ ] flux-2/klein/9b/base/edit/lora (i2i) + FLUX Kontext lora + flux-2-lora-gallery (presets)
[ ] ⚠ flux inpaint-with-LoRA endpoint (verify id); FLUX satellite/geo endpoint (Neo's note — verify)
AUDIO:
[ ] fal-ai/stable-audio-3-trainer + Stable Audio 3 /lora inference
[ ] ElevenLabs on FAL: TTS multilingual-v2 + turbo-v2.5, Music, forced-alignment (verify
    clone/design — FAL vs direct ElevenLabs API)
UTILITY:
[ ] fal-ai/sam-3/image-rle (segmentation) + SAM 3D (verify) — for data-prep + roto

## TASK 2 — TrainerDef + LoraInferenceDef registry entries
```typescript
interface TrainerDef {
  id: string                    // fal trainer endpoint
  trains: 'character'|'style'|'motion'|'audio_style'|'image_style'
  base: string                  // the model it produces a LoRA for
  dataset: { types:('image'|'video'|'audio')[]; minItems:number; captions:boolean; triggerPhrase:boolean }
  loraInference: string         // the matching /lora endpoint the LoRA runs on
  crossMode?: string[]          // e.g. H3 LoRA works on t2v+i2v+r2v
  costPerStep: number           // ~0.005 (stable-audio 0.003)
}
// Seed from the catalog; VERIFY each field from the llms.txt schema.
```

## TASK 3 — the LoRA field on inference endpoints
For each /lora inference endpoint, confirm from the schema HOW the LoRA is passed (a
lora_url / loras[] field + the trigger phrase in the prompt). Record it — buildPayload
(TR-03) uses it.

## ACCEPTANCE
[ ] every trainer + /lora inference endpoint verified (OpenAPI 200 + llms.txt schema).
[ ] TrainerDef entries: what each trains, dataset shape, matching inference, cost.
[ ] the LoRA-pass mechanism per inference endpoint recorded.
[ ] tsc green (verification is free OpenAPI, no bill).

## NEXT: TR-02 (training pipeline).
