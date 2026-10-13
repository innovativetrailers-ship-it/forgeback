# TR-02 — TRAINING PIPELINE (dataset → FAL trainer → LoRA asset). CURSOR PROMPT.
# Obey INV-1..8 + TR-00. Serverless FAL training, gated + cost-confirmed. Depends on TR-01.

## TASK 1 — Dataset assembly + upload
```typescript
// From the sidebar: user's images/videos/audio + captions + trigger phrase.
async function buildTrainingSet(files, captions, triggerPhrase): url {
  // 1. (optional) SAM-3 subject isolation for character datasets (clean the subject).
  // 2. pair each media file with a .txt caption (same basename) per the trainer's format.
  // 3. zip → fal.storage upload → return data_url.
}
```
Validate: min item count per trainer (TrainerDef.dataset.minItems), types allowed,
captions present if required.

## TASK 2 — Submit the training job (GATED, cost-confirmed)
```typescript
async function startTraining(trainerDef, dataUrl, opts) {
  const steps = opts.steps ?? 1000
  const cost = steps * trainerDef.costPerStep   // show + CONFIRM before submit
  await confirmCost(cost)                        // UI confirm — training is a priced action
  // GATED FAL call (INV-1): assert not paused (unless interactive), source, log:
  const job = await gatedRunFal(trainerDef.id, {
    [dataField(trainerDef)]: dataUrl,            // audio_data_url / training_data_url / etc.
    trigger_phrase: opts.triggerPhrase, steps, ...opts
  }, { source: 'training.'+trainerDef.trains })
  return job   // queue + webhook (training is LONG — never block)
}
```

## TASK 3 — Poll via queue/webhook + store the asset
```typescript
// On webhook complete: { lora_file (.safetensors url), config_file (json url) }
async function onTrainingComplete(job, assetMeta) {
  store({ loraUrl: job.lora_file, configUrl: job.config_file, triggerPhrase,
          trainerId: trainerDef.id, loraInference: trainerDef.loraInference,
          type: assetMeta.type, userId, name, description })
  // The asset is now a routable option (TR-03).
}
```
Show training progress in the sidebar (queued → training % → complete). Handle failure
(refund-none but clear error; training failures are the ADX error-net's domain).

## ACCEPTANCE
[ ] dataset assembles (optional SAM-3 isolation) + captions paired + zipped + uploaded.
[ ] training submits as a GATED FAL call with cost shown + confirmed; source logged.
[ ] queue/webhook progress; on complete stores {loraUrl, configUrl, triggerPhrase, inference}.
[ ] a failed training surfaces a clear error (ADX-1); no silent hang.
[ ] tsc + check:chokepoints green (training on the chokepoint — it's a paid call).

## NEXT: TR-03 (asset entities + inference wiring).
