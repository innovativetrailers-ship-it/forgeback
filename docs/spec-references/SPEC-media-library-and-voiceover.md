# SPEC — MEDIA LIBRARY (foldered) + VOICEOVER pipeline & UI
## Neo (2026-09-28): clips should NOT auto-add to the timeline — they go to an
## organised LIBRARY (folders: Scene 1, custom, variations), user DRAGS the chosen
## take to the timeline. Applies to video, imported video, music, and voice. Plus:
## where/how do we edit & fine-tune the ElevenLabs voiceover output?
## Analysed + optimised + routed. KEY: this fixes the timeline-clobber class.

═══════════════════════════════════════════════════════════════════════
# 1. THE MODEL — library = source of truth; timeline = curated selection
═══════════════════════════════════════════════════════════════════════
Correct NLE separation (and it FIXES the auto-add reconcile war — G3/G4/FIX-K):
- LIBRARY (media bin): ALL generated + imported media, organised in FOLDERS. The
  source of truth. A scene's 10 variations all live in that scene's folder.
- TIMELINE (sequence): only what the user DRAGGED in (or the director placed). A
  curated arrangement — one take per slot.
- Generation/import NO LONGER auto-adds to the timeline. It lands in the LIBRARY.
  The timeline is populated ONLY by explicit drag or director placement. → the
  timeline stops being auto-clobbered; the invariant (§Q) gets easier to hold.

═══════════════════════════════════════════════════════════════════════
# 2. FOLDERS
═══════════════════════════════════════════════════════════════════════
- A folder tree on the library. Media rows carry a folderId.
- DEFAULT: a generated/imported clip lands in the MAIN folder (or its SCENE folder
  when it came from a production plan — Wave 7 scenes → auto-folders).
- USER: create/rename folders (Scene 1, "B-roll", "hero takes"), drag clips between
  folders, drag a clip to the timeline. Variations of one shot group in its folder.
- A clip placed on the timeline STILL lives in the library (placement references
  the library item; it isn't moved out).

═══════════════════════════════════════════════════════════════════════
# 3. APPLIES TO ALL MEDIA (video, imported, music, voice)
═══════════════════════════════════════════════════════════════════════
- VIDEO + IMPORTED VIDEO: library folders → drag to a video track.
- MUSIC: a music library with folders → drag to the music track. Same model.
- VOICE: voice takes are media too — they live in the audio/voice library
  (per-scene / per-character folders), draggable, with variations (see §5).
One media model, one library, folders per media type or unified with a type filter.

═══════════════════════════════════════════════════════════════════════
# 4. HOW GENERATION/IMPORT CHANGES (the completion behaviour)
═══════════════════════════════════════════════════════════════════════
- SIMPLE / exploratory: generate → the clip lands in the LIBRARY (main or chosen
  folder). NOT the timeline. User drags the chosen take to the timeline.
- DIRECTOR / production (Wave 7): the orchestrator compiles the film — it stores EVERY
  take per shot in that scene's folder (variations grouped). It does NOT place anything
  on the timeline (Neo 2026-09-28: NOTHING auto-places, Simple OR Director). The USER
  assembles the cut by auditioning the takes and DRAGGING the chosen one per shot onto
  the strip — and a dialogue take arrives WITH its voiceover + lip-sync. Director fills
  the bins; the user cuts.
- IMPORT (Wave B.1): imported video → library folder → drag to timeline.
This is uniform: NOTHING auto-places on the timeline — Simple, Director, and Import all
land in the LIBRARY; the timeline is populated ONLY by explicit user drag.

═══════════════════════════════════════════════════════════════════════
# 5. THE VOICEOVER PIPELINE + UI (Neo's open question — the design)
═══════════════════════════════════════════════════════════════════════
Your instinct is right: voiceover is GENERATED + ATTACHED at generation. Here's the
full where/how:

## 5a. GENERATION (automatic, at shot time)
- A shot with dialogue → TTS via the character's voiceId (the character↔voice link)
  → a VOICE take attached to the shot's voice track → forced alignment → lip-sync.
- The voice take ALSO lands in the audio/voice LIBRARY (the shot's scene folder /
  a Voices folder) as a media item — so it's a take like any clip (§3).

## 5b. EDIT / FINE-TUNE — WHERE: a per-shot VOICE panel in the editor
- Select a shot (or its voice clip) → a VOICE / DIALOGUE panel opens (an inspector,
  or a tab alongside Audio Mix). It shows the shot's dialogue line(s) and the
  controls to fine-tune the ElevenLabs output:
  * LINE TEXT — editable (fix wording, add pauses/emphasis).
  * VOICE — the character's voiceId, changeable (swap voice, or pick a cloned/
    designed voice).
  * MODEL — eleven_v3 (quality) vs flash (speed).
  * EMOTION / STABILITY / SIMILARITY / STYLE / SPEED — the ElevenLabs v3 params as
    sliders.
  * RE-GENERATE — re-runs TTS with the tuned params → a NEW take.
  * LIP-SYNC toggle + re-run (re-align + re-sync after a voice change).
- The refine loop mirrors video: tune → re-generate → review, per shot.

## 5c. TAKES in the library (compare / pick)
- Each re-generated voice take is a library item (audio, in the scene/character
  folder). The user can audition takes and DRAG the chosen one to the shot's voice
  track — same library model as video. The shot's voice track holds the SELECTED
  take; alternatives live in the folder.

## 5d. SCENE / FILM level
- Music (video-to-music / text-to-music) + the mix (duck under dialogue, LUFS) live
  in the Audio Mix tab, operating on the timeline's audio tracks (voice + music +
  sfx). The per-shot VOICE panel is for the voice take; the Audio Mix tab is for the
  overall mix. Two surfaces, clear split.

═══════════════════════════════════════════════════════════════════════
# 6. ROUTING INTO THE EXISTING CONCEPT
═══════════════════════════════════════════════════════════════════════
| Piece | Built by / reuses |
|---|---|
| The library store | upgrade playbackStore.library (the current "6 videos" gallery) to a foldered media bin |
| Folders | new: folderId on media/Asset rows + a folder tree; auto-folders from Wave 7 scenes |
| Drag-to-timeline | register K deferred item (onDrop + draggable cards) — build it now; the ONLY path to the timeline |
| Completion → library not timeline | change the generation-complete handler (simple/page placeCompletedOnTimeline → placeInLibrary) + director places primary take |
| Music library | same model, music media |
| Voice generation | ElevenLabs pipeline (D4 built: TTS, alignment, lip-sync, duck) |
| Voice fine-tune panel | new UI: a per-shot VOICE inspector exposing the ElevenLabs v3 params + re-generate |
| Voice takes | audio media in the library (§3) |
Register K ("Advanced Library→Media placeholder", "drag-to-timeline") is fulfilled
here; the "awkward 6-video library" is replaced by this.

═══════════════════════════════════════════════════════════════════════
# 7. CONFLICTS & RESOLUTIONS
═══════════════════════════════════════════════════════════════════════
- CX-1 Director auto-builds the timeline vs "don't auto-add": resolved — the
  director's placement IS curation (explicit), and each slot is overridable from
  the library folder. Exploratory generation lands in the library only.
- CX-2 A timeline clip still lives in the library (placement = reference, not move)
  — deleting from the timeline does NOT delete the library take (and vice-versa is a
  user choice). Respect the timeline-data invariant (§Q): timeline placement/removal
  is separate from library existence.
- CX-3 Voice change re-triggers lip-sync: a re-generated voice take must re-run
  alignment + lip-sync for that shot (5b toggle) — don't leave stale lip-sync.
- CX-4 Storage/serve: voice + music takes serve through /api/media/{id} like video
  (one serve path, storageKey — the media fix covers audio too; verify audio
  content-type).
- CX-5 Wave 7 tie-in: production-plan scenes create the library folders; variations
  per shot group there. Build after Wave 7's scenes exist, or degrade to a flat
  main folder until then.

═══════════════════════════════════════════════════════════════════════
# 8. EXECUTION PLACEMENT
═══════════════════════════════════════════════════════════════════════
- The LIBRARY-FOLDER model + drag-to-timeline + "completion → library" is a
  near-term change (fulfils register K + fixes the timeline auto-clobber). It can
  land EARLY — it simplifies the timeline. Sequence it with Wave B (the suite/
  import) since both touch the library + timeline.
- The VOICE fine-tune panel builds with the audio suite (Wave B.5 Audio Mix) + the
  ElevenLabs stage (D4, built). The per-shot voice inspector is the new piece.
- The auto-folders-from-scenes tie-in lands with Wave 7.
Record in the register; fold the library-folder model into Wave B and the voice
panel into Wave B.5 + Wave 7.
