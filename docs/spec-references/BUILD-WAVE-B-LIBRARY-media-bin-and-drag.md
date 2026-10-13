# BUILD — WAVE B (LIBRARY): foldered media bin + completion→library + drag-to-timeline
## Spec: SPEC-media-library-and-voiceover §1–4, §6–8. Neo (2026-09-28): clips must NOT
## auto-add to the timeline — they land in an organised LIBRARY (folders per scene /
## custom), the user DRAGS the chosen take to the timeline. This FIXES the timeline
## auto-clobber class (the "6 videos" gallery, G3/G4 reconcile war) and fulfils register
## K (Advanced Library→Media + drag-to-timeline). Applies to video, imported, music, voice.
## Every task names the GATE it upholds. No gaps: conflicts are addressed up front.

═══════════════════════════════════════════════════════════════════════
# DEPENDENCY GATE
═══════════════════════════════════════════════════════════════════════
- REQUIRES F1 (BUILD-F1: G3 consistency + G4 reconcile guard) landed — the store/
  reconcile path must be sound BEFORE we make the library the source of truth, because
  this wave moves the completion target OFF the timeline and INTO the library and relies
  on the invariant that placement never deletes a library item.
- Sequences WITH Wave B (post-production suite): both touch the library + timeline.
  Build this FIRST within Wave B (B.1 import writes to the library; B.2 edit drags from
  it). It does NOT require generation (F2/F3) — imported clips exercise the whole library.
- GATES this wave must keep GREEN: INV-2 (ONE canonical store — the library is not a
  parallel store to the timeline; both read the SAME media rows), INV-4 (honest UI — no
  fake folders/placeholder cards), INV-7 (additive migration for folderId), and the
  timeline-data invariant (§Q): placement is a REFERENCE, never a move; removing a clip
  from the timeline never deletes the library take, and reconcile never purges a clip the
  user didn't explicitly delete. Each task states which it touches.

═══════════════════════════════════════════════════════════════════════
# CONFLICTS & RESOLUTIONS (address NOW — folds in spec CX-1..CX-5)
═══════════════════════════════════════════════════════════════════════
BL-C1 (CX-1) NOTHING AUTO-PLACES ON THE TIMELINE — Simple OR Director (Neo, 2026-09-28,
    overrides the earlier "director places the primary take"). Director compile produces
    takes INTO THE LIBRARY (scene folders, variations grouped); it does NOT write to the
    timeline. The USER selects the desired take per shot and DRAGS it onto the strip. The
    timeline is populated ONLY by explicit user drag (BL-T4). This is the cleanest NLE
    model: director fills the bins, the user cuts. (BL-T2 + BL-T5 both land in library only.)
BL-C2 (CX-2 / §Q) Placement = reference, not move: a timeline clip STILL lives in the
    library. The timeline clip references the library item (mediaId); it does not copy or
    remove it. Deleting from the timeline tombstones the timeline clip only — the library
    take remains. Deleting the library item is a SEPARATE explicit action (and should warn
    if it's placed on the timeline). Respect the timeline-data invariant both directions.
BL-C3 (INV-2) One store, not two: do NOT create a second media store beside the timeline
    store. The library and the timeline are two VIEWS over the same canonical media rows
    (playbackStore + the media/Asset table). The library view filters by folderId; the
    timeline view is the recipe.tracks placements that reference mediaIds. One source of
    truth (FIXFINAL-05 one-clip-store must not be re-split).
BL-C4 (CX-4) One serve path for all media: video, imported, music, voice ALL serve through
    /api/media/{id} → storageKey → signed R2 url (HOTFIX-media-serve-id-bridge). Audio is
    just another media kind — verify audio content-type is set on serve; never rebuild a
    path from the id.
BL-C5 (CX-5 / Wave 7) Scene folders come from the plan: when a clip originates from a Wave
    7 production-plan scene, it lands in that scene's auto-folder; until Wave 7 exists,
    everything degrades to the MAIN folder. The folder model must not hard-depend on Wave 7
    (folderId nullable → main).
BL-C6 (INV-4) Honest UI: no placeholder folders, no fake "coming soon" cards, no drag
    target that silently drops. If drag-to-timeline is the only path in, it must actually
    place the clip. The old "awkward 6-video gallery" is REPLACED, not left beside this.
BL-C7 PLACEMENT COMPOSES VOICEOVER + LIP-SYNC, PROMPTED + PRICED (Neo, 2026-09-28):
    dragging a dialogue take to the timeline brings its bound VOICE take + LIP-SYNC if they
    exist; if they DON'T, the user is PROMPTED to generate audio + lip-sync with the PRICE
    (credit estimate) shown + a confirm before any paid call (INV-1, guarded/credit-gated).
    Decline → video places silent (never blocks). The lip-sync is a property of the video
    take (the lip-synced take is placed) or is (re)applied on placement; the voice take goes
    on the VOICE track, time-aligned. Depends on the voice build (BUILD-WAVE-B5-VOICE): if
    the voice layer isn't built yet, video places alone and the priced voice/lip-sync compose
    lands with Wave B.5 — never blocks the video placement.

═══════════════════════════════════════════════════════════════════════
# BL-T0 — DATA CONTRACT (additive; do first — everything reads these)  [INV-7, INV-2]
═══════════════════════════════════════════════════════════════════════
1. MediaFolder model (additive migration, no DROP):
   MediaFolder { id, projectId, name, parentId?:string|null (tree),
                 kind:'main'|'scene'|'custom', sceneId?:string|null (for Wave 7 scenes),
                 createdAt, order:int }
   - Every project has a default MAIN folder (kind:'main') created on project init /
     lazily on first library read. folderId nullable everywhere → resolves to MAIN.
2. EXTEND the media/Asset row (additive): + folderId:string|null. Existing rows load with
   folderId=null → shown in MAIN. No existing column changes.
3. The library STORE shape (upgrade playbackStore.library — the current flat "6 videos"
   gallery — do NOT add a new store, INV-2/BL-C3):
   library = the set of media rows for the project (video | imported | music | voice),
   each { id, kind, sourceUrl:/api/media/{id}, folderId, thumbUrl?, label, createdBy,
   variationOf?:string|null, meta }. Folders come from MediaFolder. The timeline
   (recipe.tracks) references library items by mediaId — it does not hold copies.
VERIFY T0: migration is additive (existing media rows load, folderId null → MAIN); a
project has a MAIN folder; the library store enumerates media rows with a folderId; tsc 0.

═══════════════════════════════════════════════════════════════════════
# BL-T1 — LIBRARY AS SOURCE OF TRUTH (the view over the media rows)  [INV-2]
═══════════════════════════════════════════════════════════════════════
- The library reads ALL project media (generated + imported, all kinds) from the canonical
  store (BL-C3). It is a VIEW, filtered/grouped by folderId. It replaces the ad-hoc
  director-mode gallery entirely (BL-C6).
- A library item's existence is independent of any timeline placement. Placing it on the
  timeline adds a recipe.tracks entry that references its mediaId (BL-C2).
VERIFY T1: every generated/imported clip for the project appears in the library exactly
once, in its folder; a clip on the timeline also still shows in the library (one row, two
views); no second media store exists (grep: one clip store, FIXFINAL-05 intact).

═══════════════════════════════════════════════════════════════════════
# BL-T2 — COMPLETION → LIBRARY, NOT TIMELINE (the behaviour change)  [§Q invariant]
═══════════════════════════════════════════════════════════════════════
- CHANGE the generation-complete handler: today simple/page's `placeCompletedOnTimeline`
  puts the finished clip on the strip. REPLACE the exploratory/Simple path with
  `placeInLibrary(mediaId, folderId=MAIN or chosen)`: the clip lands in the LIBRARY
  (main, or a folder the user chose for the run). It does NOT touch recipe.tracks.
- This removes the auto-clobber source: nothing writes to the timeline on generation, so
  the G3/G4 reconcile no longer has a phantom clip to fight over. The timeline is populated
  ONLY by explicit drag (BL-T4) or director placement (BL-T5).
- Imports (Wave B.1) ALSO land in the library (a folder), not straight on the timeline —
  align B.1 to placeInLibrary. (B.1's "appears on the strip" verify shifts to "appears in
  the library, then dragged onto the strip".)
VERIFY T2: run Simple generation → the finished clip appears in the LIBRARY (main folder),
NOT on the timeline; the timeline strip is unchanged by generation; a reconcile after
generation adds nothing to the timeline (there's nothing to reconcile).

═══════════════════════════════════════════════════════════════════════
# BL-T3 — FOLDER TREE + LIBRARY UI  [INV-4 honest UI]
═══════════════════════════════════════════════════════════════════════
- A folder tree (MAIN + scene folders + custom) with media cards inside. Per card: thumb,
  label, kind badge, variation grouping (variationOf clusters under its primary).
- User actions (all real, no placeholders — BL-C6): CREATE folder, RENAME, DELETE folder
  (move its items to MAIN or ask; never orphan a media row), DRAG a card between folders
  (updates folderId only). A TYPE FILTER (All / Video / Imported / Music / Voice) since one
  library holds all kinds (§3). Optional: a media-kind may render as its own tab, but the
  underlying model is one library + folderId + kind.
- DELETE a library item = explicit, separate from timeline removal (BL-C2); warn if it's
  currently placed on the timeline, and on confirm remove both the row (R2 cleanup) and any
  timeline placements referencing it.
VERIFY T3: create/rename/delete folders; drag a card between folders (folderId changes,
item does not move on the timeline); the type filter narrows by kind; deleting a folder
never orphans a media row; no card/folder is a placeholder.

═══════════════════════════════════════════════════════════════════════
# BL-T4 — DRAG-TO-TIMELINE (register K — the ONLY path in)  [§Q, INV-2]
═══════════════════════════════════════════════════════════════════════
- Library cards are DRAGGABLE; timeline tracks accept onDrop. Dropping a card onto a track
  at a position calls `addClip` (which writes recipe.tracks — per the timeline-blockage
  audit) with a placement that REFERENCES the library mediaId + sourceUrl=/api/media/{id}
  (BL-C2: reference, not copy).
- PLACEMENT COMPOSES VOICEOVER + LIP-SYNC (Neo, 2026-09-28): when the dragged take is a
  dialogue shot:
  * IF its voiceover + lip-sync ALREADY exist → they come with the placement: video onto
    the video track, the shot's voice take onto the VOICE track, time-aligned; the lip-
    synced take is what plays. No manual re-attach.
  * IF NOT yet generated → PROMPT the user to generate audio + lip-sync, SHOWING THE PRICE
    (cost estimate in credits) + a confirm, BEFORE running (BL-C7). On confirm, generate
    via the guarded submit (INV-1, credit-gated) → the voice take + lip-sync attach. On
    decline → the video places silent (never blocked).
- A silent/no-dialogue shot places video only (no prompt, no error).
- The placed clip is subject to the SAME reconcile guards (G3 projectId consistency, G4
  preserve/merge). Because it references a real media row, reconcile treats it like any
  non-shot/imported clip — it survives (G4). A user-deleted timeline clip is tombstoned
  (does not re-add on reconcile); the library take is untouched.
- Fulfils register K ("Advanced Library→Media" + "drag-to-timeline": onDrop + draggable
  cards). Remove the old awkward gallery path (BL-C6).
VERIFY T4: drag a library clip onto a video track → it appears on the strip and PLAYS via
/api/media/{id}; a reconcile keeps it; deleting it from the timeline leaves the library
take intact and does not re-add on the next reconcile.

═══════════════════════════════════════════════════════════════════════
# BL-T5 — DIRECTOR OUTPUT → LIBRARY ONLY (no auto-placement)  [BL-C1, §Q]
═══════════════════════════════════════════════════════════════════════
- Director / production compile stores EVERY take per shot in that shot's SCENE folder
  (BL-C5) as library items (variations grouped by variationOf). It does NOT write to the
  timeline — NO auto-placement (BL-C1, Neo 2026-09-28).
- The USER assembles the cut: per shot, audition the takes in the folder and DRAG the
  chosen one onto the strip (BL-T4) — which carries its voiceover + lip-sync (BL-T4
  composition). Swapping a shot = drag a different take onto that position.
- Because the director never writes the timeline, there is no clobber to guard against on
  compile; the only timeline writes are user drags (still §Q/G4-safe). Wave 7 T5 must match:
  director compile → library, not timeline.
VERIFY T5: a director compile fills each shot's scene folder with its takes and places
NOTHING on the timeline; the user drags a chosen take per shot to build the cut; each
dragged dialogue take arrives with its voiceover + lip-sync; no compile ever writes the strip.

═══════════════════════════════════════════════════════════════════════
# BL-T6 — MUSIC + VOICE FOLLOW THE SAME MODEL (all media)  [INV-2, BL-C4]
═══════════════════════════════════════════════════════════════════════
- MUSIC: generated/imported music are library items (kind:'music') in folders → drag to the
  music track (BL-T4). Same store, same folders, same serve path (BL-C4).
- VOICE: voice takes are library items (kind:'voice') in per-scene / per-character folders,
  draggable to the voice track, with variations (variationOf). The voice GENERATION +
  fine-tune UI is the separate Wave B.5 build (BUILD-WAVE-B5-voiceover-finetune-panel) —
  THIS wave only guarantees voice takes are first-class library items served via
  /api/media/{id} with audio content-type (BL-C4).
VERIFY T6: a music track drags from the music library and plays; a voice take is a library
item, in a folder, draggable, and serves as audio via /api/media/{id} (correct content-type).

═══════════════════════════════════════════════════════════════════════
# DO NOT
═══════════════════════════════════════════════════════════════════════
- Do not create a second media store beside the timeline (one canonical store — BL-C3/INV-2).
- Do not let ANYTHING auto-place on the timeline — not generation, not import, not the
  director compile (BL-C1/BL-T5). ONLY an explicit user drag populates the timeline.
- Do not place a dialogue take without its voiceover + lip-sync (BL-C7/BL-T4).
- Do not let a timeline placement copy or move the library item (reference by mediaId — BL-C2).
- Do not let removing a timeline clip delete the library take, or let reconcile purge a
  placed clip the user didn't delete (§Q / G4).
- Do not ship placeholder folders/cards or a drag target that doesn't actually place (INV-4).
- Do not rebuild a serve path from an id — resolve row→storageKey→signed url (BL-C4).
- Do not hard-couple folders to Wave 7 (degrade to MAIN — BL-C5).

═══════════════════════════════════════════════════════════════════════
# WAVE B (LIBRARY) EXIT
═══════════════════════════════════════════════════════════════════════
Generate or import a clip → it lands in the LIBRARY (main folder), never on the timeline →
organise it into folders → DRAG the chosen take onto the timeline (it plays, and a dialogue
take arrives WITH its voiceover + lip-sync) → a reconcile keeps it. NOTHING auto-places:
the director compile fills scene folders with takes, and the USER assembles the cut by
dragging chosen takes. Music and voice are first-class library items on the same model +
serve path. Fulfils register K; replaces the "6-video" gallery; removes the timeline auto-
clobber class at the source (nothing writes the strip but the user). tsc 0; check-
chokepoints 0; check-swallowed-catches 0; check-endpoints 0. Then the voice fine-tune panel
(Wave B.5) builds on top.
