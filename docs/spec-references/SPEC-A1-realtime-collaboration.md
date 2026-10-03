# SPEC — A1: REAL-TIME COLLABORATION (multiplayer project)
# Parity gap vs InVideo Agent Two ("directors, writers, editors in one project, live
# cursors, no file-passing"). A team/studio workflow advantage. Obey INV-1..8.
# Extends ForgeReview (comments/versions exist) → LIVE co-editing.

═══════════════════════════════════════════════════════════════════════
# WHAT IT IS
═══════════════════════════════════════════════════════════════════════
Multiple users work in ONE project simultaneously: shared script, cast, timeline, shot
plan — with live presence (who's here, what they're editing), no file-passing, no
"whose version is current". A studio crew (director/writer/editor) in one room.

═══════════════════════════════════════════════════════════════════════
# ARCHITECTURE
═══════════════════════════════════════════════════════════════════════
## Shared state + sync
- Real-time sync layer over the project's shared entities (script, cast, timeline recipe,
  shot plan, playbook). Options: a CRDT (Yjs/Automerge) for conflict-free co-editing of
  the timeline/script, OR an authoritative-server + presence channel (websocket) with
  optimistic updates. RECOMMEND: CRDT for the document-like surfaces (script, timeline),
  server-authoritative for generation jobs (a shot generates once, not per-user).
- Presence channel: live cursors, selections, "X is editing shot 3", who's online.
- The canonical store (playbackStore/recipe — the ONE store from FIX-K) becomes the
  shared, synced document. All edits (add/move/trim/delete clip) broadcast to collaborators.

## Roles + permissions
- Project roles: owner / director / editor / writer / reviewer / viewer.
- Permissions per role (who can generate — a paid action, gate it; who can edit; who can
  only comment/review — ties to ForgeReview). Generation (paid) is owner/director/editor.

## Conflict handling
- CRDT merges concurrent edits (two people move different clips = both apply; same clip =
  last-write-wins with presence warning). Generation is idempotent + single (BP-02) — two
  users triggering the same shot don't double-bill (the persist-before-poll + skip-if-
  completed guards already cover this — confirm under concurrent access).

## What syncs vs what doesn't
- SYNC: script, cast, shot plan, timeline recipe, playbook, comments, presence.
- SERVER-AUTHORITATIVE (not CRDT): generation jobs, trained assets, billing — one source
  of truth; a shot generates once regardless of who clicked.

═══════════════════════════════════════════════════════════════════════
# BILLING UNDER MULTIPLAYER (⚠ critical — INV-1)
═══════════════════════════════════════════════════════════════════════
- Generation is a PAID action — gate WHO can trigger it (role) + confirm the idempotency
  guards hold under concurrency (two directors clicking generate on the same shot →
  ONE generation, via falRequestId persist-before-poll + skip-if-completed).
- Cost attribution: whose budget/account is billed (the project owner's, by default).
- Pause/chokepoint still applies per project.

## ACCEPTANCE
[ ] two users in one project see each other's edits live (script/timeline/cast) + presence.
[ ] roles + permissions (generate = owner/director/editor; reviewer = comment only).
[ ] concurrent edits merge (CRDT) without corruption; same-clip = last-write + warning.
[ ] concurrent generation of the same shot → ONE generation, no double-bill (idempotency).
[ ] the shared store IS the canonical store (FIX-K) — no divergent per-user copy.
[ ] tsc + check:chokepoints green.

## NET
Multiplayer project: shared synced script/cast/timeline (CRDT for docs, server-authoritative
for generation), live presence, roles+permissions, idempotent generation under concurrency.
Closes the collaboration gap vs Agent Two — and it's a studio/team advantage (our audience).
