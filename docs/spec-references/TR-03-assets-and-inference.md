# TR-03 — ASSET ENTITIES + LoRA INFERENCE WIRING. CURSOR PROMPT. Obey INV-1..8 + TR-00.
# Trained assets become routable; buildPayload applies the LoRA. Depends on TR-01/02 + MP pipeline.

## TASK 1 — Asset entities (additive, per-user, INV-7 + privacy)
```typescript
interface TrainedAsset {
  id; userId; name; description; type: 'character'|'style'|'audio_style'
  loraUrl; configUrl; triggerPhrase
  trainerId; loraInference   // which /lora endpoint to run it on
  subcategory: string        // lead/creature/... or movie-action/documentary-science/...
  linkedCharacterId?: string // character LoRA → VaultCharacter
}
interface Voice { id; userId; name; voiceId; source:'cloned'|'designed'; linkedCharacterId? }
```
- Character LoRA → attach to VaultCharacter (LoRA + referenceUrls + seed + voiceId).
- Style LoRA → selectable per project/shot. AudioLora → the audio layer.
- Stored per user; privacy/consent/deletion (data/rights rule).

## TASK 2 — buildPayload applies the LoRA (LoRA-capable endpoints)
```typescript
// When a shot uses a trained asset AND routes to the asset's loraInference endpoint:
if (shot.characterLora || shot.styleLora) {
  const asset = resolveAsset(shot)
  // route to asset.loraInference (the /lora endpoint), pass the LoRA + trigger:
  payload[loraField(endpoint)] = asset.loraUrl        // lora_url / loras:[{path,scale}]
  payload.prompt = `${asset.triggerPhrase}, ${payload.prompt}`  // trigger word first
}
```
The LoRA-pass mechanism per endpoint is from TR-01 Task 3. H3 LoRA works across t2v/i2v/r2v.

## TASK 3 — Orchestrator delegation to LoRA endpoints (OR-02/03)
- The model-knowledge RAG (OR-02) marks which endpoints are LoRA-capable + which asset
  applies. A consistency shot with a character that HAS a trained LoRA → delegate to the
  /lora endpoint with the LoRA (strongest consistency — beats reference-only).
- The delegation reason logs "using trained LoRA for consistency".
- Learning (OR-04/05): rate LoRA'd shots → learn if the LoRA improved consistency → weight.

## ACCEPTANCE
[ ] TrainedAsset + Voice entities (additive, per-user, privacy).
[ ] a character LoRA attaches to a VaultCharacter (full identity stack).
[ ] buildPayload applies the LoRA + trigger on the /lora endpoint (per the verified field).
[ ] the orchestrator delegates a consistency shot to the LoRA endpoint when a LoRA exists.
[ ] tsc + check:chokepoints green.

## NEXT: TR-04 (sidebar UI).
