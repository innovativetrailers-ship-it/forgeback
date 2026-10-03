# SPEC — OPEN-WEIGHT MODELS IN THE SELECTABLE POOL + DIRECTOR PIPELINE
# The open-weight bases (H3, Wan, LTX-2, FLUX, Z-Image) are FIRST-CLASS selectable models
# AND routable by the orchestrator — as BASE (no LoRA, general generation) AND as
# LoRA-APPLIED (with a trained asset). Not only "the thing you train" — generation models
# in their own right. Obey INV-1..8. Complements SPEC-TRAINING-* + FAMILY-* + orchestrator.

═══════════════════════════════════════════════════════════════════════
# THE DISTINCTION — every open-weight model has TWO forms in the pipeline
═══════════════════════════════════════════════════════════════════════
1. BASE form — the open-weight model with NO LoRA. A normal generation endpoint,
   selectable + routable alongside the commercial models (Seedance/Veo/Kling). Used for
   general shots. (H3 base is high quality; LTX-2 base is cheap/fast; Wan base is continuity.)
2. LoRA-APPLIED form — the SAME model on its /lora endpoint WITH a trained asset (a
   character/style/asset LoRA). Used for consistency/style shots where a matching LoRA exists.
Both are routable. The orchestrator picks BASE for general shots, LoRA-APPLIED when a
matching trained asset serves the shot's need (consistency/style).

═══════════════════════════════════════════════════════════════════════
# PART 1 — OPEN-WEIGHT BASES IN THE SELECTABLE POOL (the registry)
═══════════════════════════════════════════════════════════════════════
Add the open-weight bases to the registry as normal ModelDefs (per FAMILY-* + MP-01
mode-aware structure). They are FAL endpoints like any other:
```typescript
// Open-weight VIDEO bases — selectable + routable (alongside Seedance/Veo/Kling):
'minimax-h3'    : { provider:'fal', openWeight:true, loraCapable:true, endpoints:{
                    text:'minimax/h3/text-to-video', first_frame:'minimax/h3/image-to-video',
                    reference:'minimax/h3/reference-to-video' },
                    loraEndpoints:{ text:'minimax/h3/text-to-video/lora',
                    first_frame:'minimax/h3/image-to-video/lora',
                    reference:'minimax/h3/reference-to-video/lora' },
                    nativeAudio:true, /* H3 is high quality — strong general model too */ }
'wan-3.0'       : { openWeight:true, loraCapable:true, /* per FAMILY-04 + wan-trainer LoRA */ ... }
'ltx-2'         : { openWeight:true, loraCapable:true, endpoints:{...},
                    loraEndpoints:{ text:'ltx-2-19b/audio-to-video/lora', ... }, tier:'draft' }
// Open-weight IMAGE bases (references/keyframes): flux-2, z-image (base+lora), etc.
'flux-2'        : { openWeight:true, loraCapable:true, role:'image', /* + i2i/inpaint/edit lora */ }
'z-image'       : { openWeight:true, loraCapable:true, role:'image' }
```
FLAGS: openWeight:true (it's an open model — trainable, self-hostable later per the local
tier), loraCapable:true + loraEndpoints (the /lora variants). The tool matrix (MP-02b
Part D) gains a loraCapable column.

═══════════════════════════════════════════════════════════════════════
# PART 2 — SELECTABLE IN THE MODEL PICKER (UI)
═══════════════════════════════════════════════════════════════════════
- The model picker (per-shot / per-project) lists open-weight bases alongside commercial
  models, labelled (e.g. "MiniMax H3 (open)", "LTX-2 (open, draft)"). The user can pick one.
- When the user has a trained LoRA for the shot's character/style, the picker offers the
  LoRA-applied option ("H3 + [character] LoRA") — one tap to use the trained asset.
- Manual selection wins (INV-5). Auto (orchestrator) is the default.

═══════════════════════════════════════════════════════════════════════
# PART 3 — ORCHESTRATOR ROUTING: base vs LoRA-applied (OR-02/03)
═══════════════════════════════════════════════════════════════════════
The orchestrator's delegation (OR-03) chooses the form:
```typescript
function delegateOpenWeight(shot, model, project) {
  // does a trained LoRA serve this shot's need?
  const lora = matchingLora(shot, model)   // character LoRA for shot's character on THIS model,
                                            // or a style LoRA for the project genre
  if (lora && shot.purpose in ['consistency','continuity','style']) {
    return { model, mode: shotMode(shot), endpoint: model.loraEndpoints[mode],
             lora: lora.loraUrl, trigger: lora.triggerPhrase, reason:'trained LoRA for '+shot.purpose }
  }
  return { model, mode, endpoint: model.endpoints[mode], reason:'open-weight base' }
}
```
- CONSISTENCY/STYLE shot + a matching LoRA exists → LoRA-applied (strongest — the trained
  asset). The orchestrator PREFERS this (LoRA > reference > seed for consistency).
- GENERAL shot, or no matching LoRA → the open-weight BASE (a normal routing candidate,
  scored by the RAG like any model — H3 for quality, LTX-2 for cheap, Wan for continuity).
- The model-knowledge RAG (OR-02) knows each open-weight model's base strengths AND that
  it's loraCapable → routes accordingly.

═══════════════════════════════════════════════════════════════════════
# PART 4 — buildPayload for open-weight (base + LoRA)
═══════════════════════════════════════════════════════════════════════
- BASE: builds the normal mode-aware payload (MP-01, per the family field map).
- LoRA-APPLIED: routes to model.loraEndpoints[mode]; adds the LoRA field (loraUrl per the
  endpoint's schema — TR-01 Task 3) + the trigger phrase FIRST in the prompt. Same mode-
  aware payload otherwise.
- H3 note: ONE H3 LoRA works across t2v/i2v/r2v (shared attention) — so a character's H3
  LoRA applies whichever mode the shot needs.

═══════════════════════════════════════════════════════════════════════
# PART 5 — WHY OPEN-WEIGHT BASES BELONG IN THE POOL (not just for training)
═══════════════════════════════════════════════════════════════════════
- QUALITY: H3 is a top-tier video model (base) — a strong general/hero option, not only a
  LoRA target. LTX-2 base is the cheap/fast draft workhorse. Wan is the continuity model.
- COST: open-weight bases are often cheaper than premium commercial (LTX-2 for fill/draft).
- FUTURE-PROOF: open-weight = trainable (Training Studio) AND self-hostable later (local
  tier / ComfyUI). Selecting them now sets up both paths.
- CONSISTENCY LADDER: base (general) → base+reference (RAG conditioning) → base+trained LoRA
  (locked identity). The open-weight model spans the whole ladder; the orchestrator climbs
  it by need (a general shot uses base; a hero recurring-character shot uses the LoRA).

## ACCEPTANCE
[ ] open-weight bases (H3, Wan, LTX-2, FLUX-2, Z-Image) are in the registry as selectable
    ModelDefs with openWeight + loraCapable flags + loraEndpoints.
[ ] they appear in the model picker (labelled open) alongside commercial models; a LoRA-
    applied option shows when a matching trained asset exists.
[ ] the orchestrator routes base for general shots, LoRA-applied for consistency/style
    shots with a matching LoRA (LoRA > reference > seed).
[ ] buildPayload builds base OR LoRA-applied (loraUrl + trigger) per the routed form.
[ ] manual selection of an open-weight base (or base+LoRA) wins (INV-5).
[ ] tsc + check:chokepoints green.

## NET
Open-weight models (H3/Wan/LTX-2/FLUX/Z-Image) are FIRST-CLASS in the pool — selectable
in the picker and routable by the orchestrator in TWO forms: BASE (general generation,
alongside commercial models — H3 quality, LTX-2 cheap, Wan continuity) and LoRA-APPLIED
(with a trained asset for locked consistency/style). The orchestrator climbs the
consistency ladder by need: base → base+reference → base+LoRA. This makes the open-weight
models both strong generators AND the trainable-consistency path — fully integrated into
the director pipeline, not siloed as "the training models".
