# TR-04 — SIDEBAR UI (Cast/Styles/Voices/Music). CURSOR PROMPT. Obey INV-1..8 + TR-00.
# Reference: SPEC-training-studio-sidebar + SPEC-TRAINING-STUDIO-SUBCATEGORIES.

## TASK 1 — The Training Studio sidebar panel (FOUR CLEAN TABS — Neo's separation)
Keep the UI clean — separate categories, each self-contained:
- CHARACTERS — people/creature LoRAs (lead/supporting/creature/ensemble). Add → dataset
  (images+videos) + name + description + trigger + optional linked voice → Train (cost).
- STYLES — genre presets (instant, TR-05) + trained style LoRAs + Music/SFX styles.
- ASSETS — object/prop LoRAs (vehicle/prop/product/set-piece), SEPARATE from characters.
  Same train flow, no voice link. → consistent object reference.
- VOICES — clone (upload ≥10s) / design (describe) → Voice asset → link to a Character.
Music/SFX can be a sub of Styles or a minor 5th tab — keep the 4 primary tabs clean.
NOTE: the ORCHESTRATOR handles the training handoff (SPEC-TRAINING-MODEL-CATALOG "handoff")
— the UI just collects media+type+description; the orchestrator picks the trainer +
assembles the dataset + submits to FAL.

## TASK 2 — The asset library
Each tab lists the user's trained assets: thumbnail/name/type/status (training %/ready),
+ actions (use in project, rename, delete → cascades the content + asset per privacy).

## TASK 3 — Train flow UX
Add media → (optional SAM-3 clean) → caption guidance (domain-aware, TR-05) → trigger
phrase → steps (with cost = steps × rate, SHOWN) → Confirm & Train → progress → ready.
Training runs in background (queue/webhook); the sidebar shows progress; the user keeps working.

## TASK 4 — Use an asset in a project
- A trained Cast LoRA → assignable to a shot's character (routes to the /lora endpoint).
- A Style preset/LoRA → set per project (genre) or per shot.
- A Voice → linked to a character for dialogue.
Selecting an asset sets the shot/project fields the orchestrator reads (TR-03).

## ACCEPTANCE
[ ] the sidebar has Cast/Styles/Voices/Music tabs with the subcategories.
[ ] add-media → train (cost shown + confirmed) → background progress → ready asset.
[ ] the asset library lists + manages assets (use/rename/delete-cascade).
[ ] an asset is selectable into a project/shot (sets the orchestrator's fields).
[ ] tsc + check:chokepoints green.

## NEXT: TR-05 (genre presets + import + rights).
