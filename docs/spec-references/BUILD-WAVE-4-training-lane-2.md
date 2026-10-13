# BUILD — WAVE 4: TRAINING LANE (the moat's asset engine)
## From DEFERRED-EXECUTION-PROGRAM Wave 4. Clears register H (Training Studio),
## J (trainers), N (C3 x2), O (Wan 2.2 / trainer-base-open / backup-continuity),
## and the IDEAS-BACKLOG T2I studio. BUILD IN STRICT ORDER — each phase depends on
## the prior. 4.0 (asset model) is LOAD-BEARING: get it right before anything hangs
## on it.
## Design sources: SPEC-orchestrator-model-routing §4b (open-weight/backup),
## IDEAS-BACKLOG (T2I asset-model contract), register O (Wan 2.2).

═══════════════════════════════════════════════════════════════════════
# DEPENDENCY GATE
═══════════════════════════════════════════════════════════════════════
- REQUIRES F1–F3 (the pipeline works: generate → store → timeline; brain runs).
- LIFTS THE TRAINING GATE (4.4): training currently GATED OFF for billing safety.
  It goes live through the ONE guarded spine (startTraining → submitToFal → pause
  guard). Confirm billing safety BEFORE lifting (4.4 step 1).
- LEGAL/PRIVACY (standing rule, applies throughout): training CONTENT (user's
  source images/videos) is the USER's, held ON THEIR BEHALF — NEVER repurposed for
  shared models or anything else. Only aggregate OUTCOME data is the platform's.

═══════════════════════════════════════════════════════════════════════
# 4.0 — ASSET DATA MODEL (LOAD-BEARING — do FIRST, get it right)
═══════════════════════════════════════════════════════════════════════
The contract every later phase + the T2I studio + director references read. Define
ONE asset shape and migrate to it (additive, INV-7):
```
Asset {
  id, ownerId,
  kind: 'character' | 'style' | 'asset' | 'voice',
  sourcePrompt: string | null,          // the T2I prompt, if generated
  sourceRefs: string[],                 // uploaded/selected source images/videos (R2 keys)
  generatedImage: string | null,        // the representative image (R2 key)
  trainedLoRA: {                        // null until trained
    weightsKey: string,                 // R2 key of the LoRA weights
    baseModel: string, baseVersion: string,   // what it was trained on
    baseBackupKey: string,              // our backup of that base (4.6)
  } | null,
  usableAsReference: boolean,           // can the director use it as a ref image?
  // --- PRIMARY-REFERENCE / VARIATIONS (SPEC-entity-variations, drift prevention) ---
  isPrimary: boolean,                   // the canonical node of this entity
  variations: [{                        // derived variants (Evie@10, Callum-unmasked, machine-fallen)
    variantId: string, label: string,
    generatedFrom: string,              // assetId|variantId — the reference LINEAGE (defaults to primary)
    modifierPrompt: string,             // the DELTA only ("~12 yrs younger", "helmet open, wounded")
    generatedImage: string | null,      // resolved via image-to-image FROM generatedFrom (4.7)
    resolutionState: 'unresolved'|'imported'|'generated'|'trained',
    appearsInShots: string[]
  }],
  createdAt, updatedAt
}
```
- Extend vault/character.ts + the media/library model to this shape (characters are
  one `kind`). Additive migration; backfill existing characters as kind:'character',
  isPrimary:true, variations:[] (a bare entity = a primary with 0 variations).
- This is the SINGLE contract read by: the T2I studio (4.7), training (4.4), the
  director's reference inputs (reference-to-video / elements[] / first-frame), and
  delegate (to select a trained asset).
- VARIATION RULE (SPEC-entity-variations): a variation is generated USING generatedFrom
  (primary/LoRA) as a reference input — NEVER an independent text-only gen when a parent
  exists (that's the drift bug). Resolve each (entity,variant) ONCE, cache, apply to its
  appearsInShots (Wave 7 T2).
VERIFY 4.0: the Asset model exists with isPrimary + variations[]; an existing character
reads as kind:'character', isPrimary:true, variations:[] (nulls where not set); a
variation records generatedFrom + modifierPrompt. No consumer reads a divergent shape.

═══════════════════════════════════════════════════════════════════════
# 4.1 — OPEN-WEIGHT BASE IN THE POOL (register O)
═══════════════════════════════════════════════════════════════════════
- Add Wan 2.2 (Wan2.2-T2V-A14B + Wan2.2-TI2V-5B) to the registry as the
  OPEN-WEIGHT / training base + local/BYO anchor, DISTINCT from the hosted
  wan-2.7/wan-3.0 API rows. Mark `class: 'open-weight-base'`, `pinned: true`.
- It is NOT in the hosted auto-council (it's the training/local lane, not pay-per-
  call). Verify ids against the LIVE FAL listing (FAL rules — not docs).
VERIFY 4.1: Wan 2.2 appears as an open-weight base entry, pinned, separate from
hosted wan rows; the debate/router cannot auto-swap it (SPEC §4b).

═══════════════════════════════════════════════════════════════════════
# 4.2 — VERIFY TRAINER BASE IS OPEN (register O — a real-bug check)
═══════════════════════════════════════════════════════════════════════
- Confirm fal-ai/wan-trainer (and the other trainers) target an OPEN base (Wan 2.2),
  not a closed version. A trainer pointed at closed weights CANNOT fine-tune — if
  any trainer's base is closed, that's a real bug: fix it to the open base.
- Map each trainer → its open base + the matching LoRA-inference endpoint (4.3).
VERIFY 4.2: every registered trainer's base is an open, fine-tunable model; the
map trainer→base→lora-endpoint is complete and live-verified.

═══════════════════════════════════════════════════════════════════════
# 4.3 — LoRA INFERENCE MECHANISM (register N/C3 — ONE per-family path)
═══════════════════════════════════════════════════════════════════════
- loraMechanism (trainerRegistry.ts:506) has 0 callers. WIRE it. Reconcile with
  loraEndpointForMode so there is ONE per-family LoRA-inference path: call the LoRA
  endpoint the way EACH family requires (verify live per FAL — families differ; do
  NOT assume base-endpoint-takes-a-lora-url).
- Missing-family-pass must NOT silently drop the LoRA (trainedAsset.ts:145
  returns): fail loud or handle explicitly — a dropped LoRA = the user's trained
  asset silently not applied.
VERIFY 4.3: for each trained family, inference applies the LoRA via its correct
endpoint; a family with no LoRA path errors loudly (never silently drops).

═══════════════════════════════════════════════════════════════════════
# 4.4 — TRAINING SUBMIT: lift the gate (register J)
═══════════════════════════════════════════════════════════════════════
1. Confirm startTraining is the ONE trainer spine and bills through submitToFal →
   the pause guard (billing-safe). THEN lift the training gate so training runs.
2. Expose the 9 registered trainers in the UI BY CATEGORY (Cast / Style / Asset /
   Voice tabs — TrainingStudioPanel) OR mark specific ones registry-only-by-intent
   and record it (register J).
3. Training billing: each run bills through the FAL guard; credit-gate it like
   generation (checkAccess) so a user can't train without credits.
VERIFY 4.4: a training run submits through the guarded spine, credit-gated, and a
LoRA comes back; the UI exposes trainers by the four categories.

═══════════════════════════════════════════════════════════════════════
# 4.5 — TRAINING HANDOFF (register N/C3): completed LoRA → usable asset
═══════════════════════════════════════════════════════════════════════
- onTrainingComplete (training/complete.ts) stores + promotes but does NOT call
  orchestrate. WIRE the handoff: a completed LoRA is registered as a usable Asset
  (4.0) that delegate/the director can SELECT (trainedAsset → delegate pool).
- The Asset's trainedLoRA fields (weightsKey, baseModel, baseVersion, baseBackupKey)
  are set here.
VERIFY 4.5: after training, the new LoRA appears as a selectable Asset; the
orchestrator can pick it for a shot (a character LoRA applied in a generation).

═══════════════════════════════════════════════════════════════════════
# 4.6 — BACKUP / CONTINUITY (register O + SPEC §4b)
═══════════════════════════════════════════════════════════════════════
- HOLD OUR COPY of each open base in R2 (baseBackupKey on the Asset's trainedLoRA).
  Apache-2.0 (Wan 2.1/2.2) permits — verify license per base before backing up.
- PER-LORA BASE PIN: each Asset.trainedLoRA records its exact base + version +
  baseBackupKey (from 4.0).
- SOURCE DATA preserved (user's asset, NEVER repurposed) for retrain-migration to a
  new base (weights don't transfer across architectures — retrain from source).
- SERVE-FROM-BACKUP: if a hosted base is pulled, serve LoRAs from our backed-up
  base (no forced retrain). CONTINUITY ALERT (not auto-swap) on upstream deprecation.
VERIFY 4.6: a simulated base-pull → LoRAs still resolve/serve from the backup;
per-LoRA base pin is populated; source data is retained (owner-scoped, not shared).

═══════════════════════════════════════════════════════════════════════
# 4.7 — T2I ASSET STUDIO (IDEAS-BACKLOG — build LAST, sits on 4.0)
═══════════════════════════════════════════════════════════════════════
- A standalone text-to-image surface over the EXISTING image-gen, saving into the
  4.0 asset library. Categories Cast/Style/Asset/Voice (voice via audio, not image).
- A generated character/location/asset image is saved as an Asset (4.0) →
  trainable (4.4) → usable as a director reference (usableAsReference).
- Reuses the pipeline (submit → store → /api/media serve, same as generation);
  additive UI. Feeds training AND director references — one asset library, three
  consumers.
- DERIVE-FROM-REFERENCE MODE (SPEC-entity-variations — REQUIRED for drift prevention):
  the studio can generate a VARIATION from a parent via IMAGE-TO-IMAGE / reference-
  conditioned T2I (IP-adapter or the family's reference-image input) — input =
  generatedFrom's generatedImage (or the LoRA), prompt = the variation's modifierPrompt.
  This is HOW Evie@10 carries Evie@22's face. Endpoint via the registry + buildPayload
  (INV-3/C2), verified live per FAL. UI: "Add variation" on an Asset → pick parent →
  modifier prompt → generate (derives, not fresh). Credit-gated + guarded (INV-1).
VERIFY 4.7: generate a character (primary) in the T2I studio → it saves as an Asset →
add a VARIATION derived from it (image-to-image; the face carries) → train a LoRA on the
primary (open Wan 2.2) → the orchestrator uses the right variation in a shot. Full loop
including the primary→variation derivation.

═══════════════════════════════════════════════════════════════════════
# DO NOT
═══════════════════════════════════════════════════════════════════════
- Do not build later phases before 4.0's asset model is right (everything reads it).
- Do not repurpose user training CONTENT for shared models (legal/moat line).
- Do not point a trainer at a closed base (4.2).
- Do not let a missing LoRA-family-pass silently drop the LoRA (4.3).
- Do not let the debate/router auto-swap the open-weight base (pinned, SPEC §4b).
- Do not generate a variation as an independent text-only gen when a parent reference
  exists — derive it from generatedFrom (4.7 / SPEC-entity-variations); that's the drift bug.

═══════════════════════════════════════════════════════════════════════
# WAVE 4 EXIT
═══════════════════════════════════════════════════════════════════════
Full loop: a user generates a character in the T2I studio → trains a LoRA on the
open Wan 2.2 base → the orchestrator uses it in a shot → the asset survives a
simulated base-pull (served from backup). Clears register H(training), J, C3(x2),
O, and the T2I backlog item. tsc 0; chokepoints 0; swallowed 0. Remove the rows.
