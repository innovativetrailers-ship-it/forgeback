# SPEC PHASE 4 — CHARACTER SYSTEM → DIRECTOR MODE
## Answers: "is character creation wired to director mode?" As a contract: creation,
## identity persistence (seed + reference), voice linkage, wardrobe continuity, and
## the exact flow of a character into every generation stage. Imports Phase 1 types.

## THE CORE PROBLEM THIS SOLVES
## A film needs the SAME character to look and sound consistent across many shots.
## Without this system, shot 1's MAYA and shot 7's MAYA are different people. The
## anchor chain carries the last FRAME; the character system carries IDENTITY
## (face, seed, voice, wardrobe) independent of any single frame.

═══════════════════════════════════════════════════════════════════════
# PART 1 — CHARACTER CREATION (3 entry points → one Character)
═══════════════════════════════════════════════════════════════════════
All three produce the same Character entity (Phase 1). The Character is the
single source of identity truth; every shot references it by id.

── ENTRY A: Auto-extracted from script (Stage 1 breakdown) ──
```typescript
// breakdown() emits ShotDraft.characterNames. A post-pass creates Characters:
extractCharacters(shots: ShotDraft[], brief: CreativeBrief, ctx): Promise<Character[]>
// For each unique name → one claudeCall (source='character.describe') producing:
//   { name, descriptor }  e.g. { "MAYA", "28, sharp-eyed, determined, dark bob" }
// Then Stage 0 generates the reference image + seed (below).
```

── ENTRY B: Manually created in the Cast UI ──
```typescript
createCharacter(input: { projectId, name, descriptor, referenceImage?: File }, ctx): Promise<Character>
// User types a name + description, OR uploads a reference photo. If no image →
// generate one (Entry C flow). If uploaded → that IS the reference; derive seed.
```

── ENTRY C: Reference-image generation (Stage 0 / on demand) ──
```typescript
generateCharacterReference(character: Character, brief: CreativeBrief, ctx): Promise<Character>
// text→image via draft model (through providerSubmit, source='character.ref') using
// character.descriptor + brief.styleKey for a style-consistent portrait. Capture the
// generation SEED. Persist referenceImageUrl (mirrored) + seed. This seed is the
// identity key reused for every shot featuring the character.
```

CREATION CURSOR PROMPT:
```
Implement character creation per spec-4 Part 1. Three entry points (auto-extract
from breakdown, manual Cast UI create, reference generation) all producing the
Character entity. generateCharacterReference uses the draft model via
providerSubmit (source='character.ref'), captures+persists the SEED, mirrors the
image. Character is the single identity source; shots link by characterIds.
```

═══════════════════════════════════════════════════════════════════════
# PART 2 — IDENTITY PERSISTENCE (the mechanism that keeps a character consistent)
═══════════════════════════════════════════════════════════════════════
Three complementary mechanisms, applied per shot at generation time:

── 2a. SEED REUSE (deterministic identity) ──
Every shot featuring character C passes C.seed to the model (where supported).
Same seed + consistent descriptor → consistent face across shots.
```typescript
// In buildPayload (Stage 3), when shot.characterIds non-empty:
const chars = await adapter.getCharacters(shot.projectId)
const primary = chars.find(c => c.id === shot.characterIds[0])
if (primary?.seed && modelSupportsSeed(endpoint)) payload.seed = primary.seed
```

── 2b. REFERENCE IMAGE CONDITIONING (visual identity) ──
The character.referenceImageUrl is passed as a reference/identity image to models
that support it (character reference / face-lock). Distinct from the anchor frame:
- anchorFrameUrl = the PREVIOUS SHOT's end frame (temporal continuity)
- referenceImageUrl = the CHARACTER's canonical look (identity continuity)
Both can apply to one shot. Priority per model capability:
```typescript
// models with a dedicated character-ref input (e.g. seedance 9-image multiref):
if (modelSupportsCharRef(endpoint)) payload.reference_images = chars.map(c => c.referenceImageUrl)
// else fall back to the anchor frame for I2V:
else if (shot.anchorFrameUrl) payload.image_url = shot.anchorFrameUrl
```

── 2c. DESCRIPTOR INJECTION (textual identity) ──
The character.descriptor is woven into the shot prompt so the text reinforces the
visual: "Close-up of MAYA (28, sharp-eyed, determined, dark bob) at the café..."
```typescript
composeShotPrompt(shot, chars): string
// deterministic template merge — injects each referenced character's descriptor
// into the prompt at composition time. No LLM call (cheap, consistent).
```

PERSISTENCE CURSOR PROMPT:
```
Implement identity persistence per spec-4 Part 2. In buildPayload (Stage 3): pass
character seed (2a) when the model supports seeds; pass reference_images for
char-ref-capable models else fall back to anchor frame (2b); inject descriptors
into the prompt via composeShotPrompt (2c). Distinguish referenceImageUrl
(identity) from anchorFrameUrl (temporal) — both may apply. Add modelSupportsSeed/
modelSupportsCharRef capability flags to ModelDef.
```

═══════════════════════════════════════════════════════════════════════
# PART 3 — VOICE LINKAGE (character ↔ audio identity)
═══════════════════════════════════════════════════════════════════════
```typescript
assignVoice(character: Character, ctx): Promise<Character>   // sets voiceId
// On first dialogue for a character: assign ONE ElevenLabs voice (or clone from
// uploaded reference audio) → persist character.voiceId. Every dialogue line for
// that character across ALL shots uses the SAME voiceId. (Stage 7 reads it.)
```
VOICE CLONING (optional): upload 30s reference audio → ElevenLabs clone → store as
the character's permanent voiceId.
LIP SYNC (deferred to post-v1): OmniHuman takes the generated video + the voice
stem → lip-synced output. The contract exists; v1 ships voice stems only.
VOICE CURSOR PROMPT:
```
Implement voice linkage per spec-4 Part 3. assignVoice sets a stable ElevenLabs
voiceId per character on first dialogue; optional clone-from-upload. Stage 7 uses
character.voiceId for every line by that character. Persist on the Character. Do
NOT implement lip-sync in v1 (interface only).
```

═══════════════════════════════════════════════════════════════════════
# PART 4 — WARDROBE / CONTINUITY (working memory)
═══════════════════════════════════════════════════════════════════════
```typescript
// Working memory (Phase 3) tracks per-character continuity within a project:
interface CharacterContinuity { characterId: string; wardrobe: string; props: string[] }
// Set when first established ("MAYA in a red jacket"), read into composeShotPrompt
// for every subsequent shot so the red jacket persists to scene 7.
updateContinuity(projectId, characterId, patch: Partial<CharacterContinuity>): void
```
This is the "red jacket in scene 1 → still there in scene 7" guarantee from the
showcase. v1 minimal: wardrobe string on Character + injection into prompt.
Deferred: full prop/position tracking, visual continuity verification.

═══════════════════════════════════════════════════════════════════════
# PART 5 — HOW A CHARACTER FLOWS THROUGH THE PIPELINE (the wiring)
═══════════════════════════════════════════════════════════════════════
The end-to-end thread — this is the "wired to director mode" answer:

```
Stage 1 breakdown → ShotDraft.characterNames
   ↓
extractCharacters → Character rows (name, descriptor)
   ↓
Stage 0 preprod → generateCharacterReference (referenceImageUrl + seed)
                → assignVoice (voiceId) for speaking characters
   ↓
Director UI (Phase 5) → user sees Cast panel; each shot shows its characters;
   user can edit descriptor, swap reference, set wardrobe, reassign model
   ↓
Stage 3 dispatch → buildPayload composes:
   - composeShotPrompt (descriptor + wardrobe injection)   [2c, 4]
   - seed = character.seed                                  [2a]
   - reference_images = character.referenceImageUrl(s)      [2b]
   - (anchor frame if no char-ref support)
   ↓
Stage 7 audio → character.voiceId → voice stem per line
   ↓
Result: same face (seed+ref), same clothes (wardrobe), same voice (voiceId)
        across every shot the character appears in.
```

DIRECTOR-MODE INTEGRATION (explicit):
- In Director mode, the Cast panel lists all project Characters.
- Each Shot's direction card (Phase 5) shows which characters are in it, with
  their reference thumbnails.
- Selecting a character for a shot adds its id to shot.characterIds → the whole
  persistence chain above activates for that shot.
- Manual override: user can swap a character's reference image or seed at any
  time; all subsequent shots use the new identity (past shots unchanged unless
  re-generated).

FULL-FLOW CURSOR PROMPT:
```
Wire the character flow per spec-4 Part 5. characterIds on Shot drive: prompt
composition (descriptor+wardrobe), seed reuse, reference-image conditioning, and
voice assignment. The Director-mode Cast panel (Phase 5) manages Characters and
assigns them to shots. Assigning a character to a shot activates the full
persistence chain in Stage 3 + Stage 7. Verify: a 3-shot film with one character
produces consistent face + voice + wardrobe across all three.
```

## VERIFY (the whole system)
A. Create a character (any entry point) → Character row with ref image + seed.
B. Assign to 3 shots → all 3 pass the same seed + reference + descriptor.
C. Speaking character → same voiceId across all dialogue lines.
D. Set wardrobe once → persists in all subsequent shot prompts.
E. Swap reference image → subsequent shots use new identity; past shots unchanged.
F. Director-mode Cast panel shows characters + per-shot assignment works.

## NEXT
Phase 4 (this doc) = Character System fully wired to Director mode — creation,
seed/reference persistence, voice, wardrobe, and the end-to-end pipeline flow.
Say "next" for PHASE 5 — the UI Surface Map: every toolbar, button, panel, tool
call → handler → route → contract, per workspace, per host (the "have we linked
all tool calls, toolbars, interfaces" answer).
