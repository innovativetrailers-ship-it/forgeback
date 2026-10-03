# TRAINING STUDIO BUILD PROMPTS — INDEX (Cursor)
# Implements SPEC-training-studio-sidebar + SPEC-TRAINING-MODEL-CATALOG +
# SPEC-TRAINING-STUDIO-SUBCATEGORIES. Serverless FAL training — no GPU infra.
# Feed ONE per session. Obey INV-1..8 from BP-00. ⚠ Verify every FAL endpoint via the
# free OpenAPI fetch + the per-model llms.txt (fal.ai/models/<id>/llms.txt) before wiring.

## CHUNKS (in order)
TR-01  TRAINER + LoRA-INFERENCE registry — index the verified FAL trainers + /lora
       inference endpoints per family (H3, Wan, LTX-2, FLUX.2, Stable Audio 3). The
       model layer for training.
TR-02  TRAINING PIPELINE — the train flow: dataset zip → fal.storage upload → trainer
       (gated, cost-confirmed) → queue/webhook → store LoRA asset. Serverless.
TR-03  ASSET ENTITIES + LoRA INFERENCE WIRING — StyleLora/CharacterLora/Voice/AudioLora
       entities; buildPayload lora field; the orchestrator delegates to /lora endpoints.
TR-04  SIDEBAR UI — Cast/Styles/Voices/Music tabs; genre presets (instant) + train (with
       cost); asset library; import subcategories with consent gates.
TR-05  GENRE PRESETS + IMPORT + RIGHTS — the movie/tv/anime/documentary/sport/racing
       presets; domain-aware import; the RIGHTS/consent enforcement (critical).
TR-06  OPEN-WEIGHT MODELS IN THE POOL — the open-weight bases (H3/Wan/LTX-2/FLUX/Z-Image)
       as selectable + routable models (BASE + LoRA-APPLIED) in the director pipeline.

## INVARIANTS (every prompt)
- Every trainer/inference call is a GATED paid FAL call (INV-1), cost shown + confirmed.
- Training CONTENT is the user's (privacy/consent/retention/deletion — NOT repurposed).
- OUTCOME data feeds the orchestrator (aggregate, anonymised). (Data/rights rule.)
- Additive schema (INV-7). Verify endpoints via OpenAPI (no guessed strings).
- ELEVENLABS on FAL: TTS/music/alignment confirmed on FAL; clone/design — verify FAL vs direct.

## SEQUENCING: this is a standalone feature — build after the core generation pipeline
(MP-01..12) works. It ENHANCES consistency (trained LoRAs) + adds the studio moat.
