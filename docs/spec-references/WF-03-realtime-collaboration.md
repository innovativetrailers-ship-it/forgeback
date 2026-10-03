# WF-03 — REAL-TIME COLLABORATION (multiplayer). CURSOR PROMPT. Obey INV-1..8 + WF-00.
# Reference: SPEC-A1-realtime-collaboration. ⚠ THE HEAVIEST — depends on: the canonical
# store (FIX-K), BP-02 idempotency, ForgeReview, the chokepoint. Build LAST of the three.

## TASK 1 — The shared, synced project state
- Make the CANONICAL store (FIX-K playbackStore/recipe + script + cast + shot plan +
  playbook) a SHARED, synced document. CHOOSE the sync mechanism:
  - CRDT (Yjs/Automerge) for the DOCUMENT surfaces (script, timeline recipe, cast list,
    shot plan) — conflict-free concurrent editing.
  - SERVER-AUTHORITATIVE for generation jobs, trained assets, billing (one source of truth).
- The shared doc IS the canonical store (INV-2) — NOT a parallel collaborative copy. All
  edits (add/move/trim/delete clip, edit script, assign cast) sync via the CRDT.

## TASK 2 — Presence channel
- A websocket presence layer: who's online, live cursors, current selection ("X is editing
  shot 3"), typing/editing indicators. Ephemeral (not persisted).

## TASK 3 — Roles + permissions
```typescript
type ProjectRole = 'owner'|'director'|'editor'|'writer'|'reviewer'|'viewer'
// permissions: generate (paid) = owner/director/editor ; edit timeline/script = +writer ;
// comment/annotate = +reviewer (ties to ForgeReview) ; viewer = read-only.
```
Enforce on every action — especially GENERATION (paid) is role-gated.

## TASK 4 — ⚠ IDEMPOTENT GENERATION UNDER CONCURRENCY (billing safety — critical)
- Two users triggering the SAME shot must produce ONE generation, not two (no double-bill).
- RELY ON + confirm BP-02: falRequestId persist-before-poll + skip-if-completed+videoUrl.
  Under concurrent access, add a per-shot generation LOCK (or an atomic "claim" on the shot)
  so only the first trigger submits; others attach to the in-flight job.
- Cost attribution: the PROJECT OWNER's account is billed (configurable). The pause/
  chokepoint applies per project. TEST: two clients, same shot, same instant → one FAL call.

## TASK 5 — Conflict handling
- CRDT merges concurrent edits (different clips → both apply; same clip → last-write + a
  presence warning). Never corrupt the timeline. Generation state is server-authoritative
  (not CRDT) — a shot's status is one truth.

## TASK 6 — Extend ForgeReview (not a parallel system)
- ForgeReview (comments/annotations/versions) becomes the LIVE review layer — comments
  appear in real-time; reviewers see live changes. Wire it into the presence + sync, don't
  duplicate it.

## ACCEPTANCE
[ ] two users in one project see each other's edits (script/timeline/cast) + live presence.
[ ] roles enforced (generate = owner/director/editor; reviewer = comment-only).
[ ] concurrent edits merge without corruption (CRDT); same-clip = last-write + warning.
[ ] ⚠ concurrent generation of the same shot → ONE FAL call, no double-bill (lock + BP-02) — TESTED.
[ ] the shared doc IS the canonical store (FIX-K) — no divergent copy.
[ ] ForgeReview is the live review layer (extended, not duplicated).
[ ] cost billed to the project owner; pause/chokepoint per project.
[ ] tsc + check:chokepoints green.

## THIS COMPLETES THE WORKFLOW-PARITY BUILD.
WF-00 (index) → WF-01 (context ingestion) → WF-02 (playbooks) → WF-03 (collaboration).
Closes the workflow gaps vs InVideo Agent Two — WIRED into the orchestrator, the canonical
store, the RAG, cast/location/voices, idempotency, and ForgeReview. Parity achieved; the
moat (narrative consistency, local/BYO, training, deep post) is where we DOMINATE.
