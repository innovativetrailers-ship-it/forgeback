# TR-05 — GENRE PRESETS + IMPORT + RIGHTS. CURSOR PROMPT. Obey INV-1..8 + TR-00.
# Reference: SPEC-TRAINING-STUDIO-SUBCATEGORIES. ⚠ RIGHTS enforcement is CRITICAL.

## TASK 1 — Genre presets (instant style — prompt+grade+camera, NO training, free)
Ship the preset bundles (extend SPEC-08 style_key):
- MOVIE/BLOCKBUSTER: Action|Sci-Fi|Drama|Romance|Comedy|Horror|Thriller|Fantasy
- TV: Drama Series|Sitcom|Procedural|Reality|Soap
- ANIME: Shonen|Shojo|Seinen|Mecha|Slice-of-Life|Cel-shaded|Modern-digital (⚠ descriptors,
  NOT brand replication — no "train on Studio X's films" preset)
- DOCUMENTARY: History|Science|Nature|Political|True-Crime|Biography|Investigative
- SPORT: Broadcast|Cinematic-slow-mo|Hype-reel|Analysis
- RACING: Onboard|Broadcast|Cinematic|Drift-Rally|F1-style
Each preset = { stylePrompt, gradeParams, cameraDefaults, pacing, grain }. Applied at
generation (composePrompt style fragment + grade + camera bias). Per project or per shot. Free.

## TASK 2 — Domain-aware import (dataset prep per subcategory)
For each import subcategory (movie/tv/anime/documentary/racing/sport): pre-configure
(a) captioning guidance for that domain, (b) the recommended trainer + settings (per the
catalog), (c) SAM-3 subject isolation for character datasets, (d) the consent gate (Task 3).

## TASK 3 — ⚠ RIGHTS ENFORCEMENT (protects user AND the moat)
CRITICAL — the highest copyright-risk path:
- CONSENT GATE on import of movie/tv/anime footage: the user must confirm they OWN or are
  LICENSED for the material before training. Block training without it.
- NO PLATFORM REPURPOSING: imported content is the user's, held only to provide THEIR
  service (train THEIR LoRA). The platform does NOT train its own models on it or retain
  it beyond need. (Data/rights rule.)
- NO BRAND-REPLICATION PRESETS: genre presets are STYLE DESCRIPTORS ("anime cel-shaded
  look"), never shipped LoRAs trained on a specific studio's copyrighted films.
- DELETION cascades: removes the imported dataset + the trained asset.
- VOICES/FACES: explicit consent (biometric law) — a voice clone / face LoRA needs the
  subject's consent confirmation.

## ACCEPTANCE
[ ] genre presets (all subcategories) apply an instant style; no training, no cost.
[ ] import subcategories pre-configure dataset prep + captioning + trainer per domain.
[ ] a consent gate blocks movie/tv/anime training without own/licensed confirmation.
[ ] no platform repurposing of imported content; deletion cascades; no brand-replication presets.
[ ] voice/face training requires subject-consent confirmation.
[ ] tsc + check:chokepoints green.

## THIS COMPLETES THE TRAINING STUDIO BUILD.
TR-00 (index) → TR-01 (trainer registry) → TR-02 (training pipeline) → TR-03 (assets +
inference) → TR-04 (sidebar UI) → TR-05 (presets + import + rights). Serverless FAL
training: cast/style/voice/audio LoRAs, genre presets, domain import — the studio moat +
trained consistency, with rights protected.
