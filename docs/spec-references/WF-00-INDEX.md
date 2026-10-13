# WORKFLOW-PARITY BUILD PROMPTS — INDEX (Cursor)
# Implements SPEC-A1 (collaboration), SPEC-A2 (context ingestion), SPEC-A3 (playbooks).
# Closes the workflow gaps vs InVideo Agent Two. Feed ONE per session. Obey INV-1..8 (BP-00).
# ⚠ SEQUENCING: build AFTER the core generation pipeline (MP-01..12) + orchestrator (OR-01..06)
# + the moat-proof narrative demo. These are PHASE 2 (parity), not the load-bearing core.

## CHUNKS
WF-01  PROJECT CONTEXT INGESTION (A2) — drop any file/link → parsed/understood/embedded/
       linked → the orchestrator reads it. (Build FIRST of the three — it feeds the
       orchestrator + is a dependency others lean on.)
WF-02  PLAYBOOKS (A3) — standing per-project/user directives the orchestrator applies as
       overridable defaults. (Depends on the orchestrator OR-01/03.)
WF-03  REAL-TIME COLLABORATION (A1) — multiplayer project (shared synced state, presence,
       roles, idempotent generation under concurrency). (Depends on the canonical store FIX-K
       + BP-02 idempotency; the heaviest of the three.)

## INVARIANTS (every prompt)
- Every paid call (LLM/vision for understanding, generation) is GATED (INV-1) + on the
  chokepoint. Uploaded content = the user's (privacy/consent/deletion — data/rights rule).
- The canonical store (FIX-K playbackStore/recipe) is the ONE store — collaboration syncs
  IT; ingestion links to IT; playbooks default INTO it. NO divergent copies (INV-2).
- Additive migrations (INV-7). Desktop/web parity via @cinema/core (INV-8).
- A playbook/rule can NEVER disable safety/billing invariants or suppress honest flagging.

## DEPENDENCY MAP (⚠ wire to these — do not build in isolation)
- The ORCHESTRATOR (OR-01 premise-lock, OR-02 RAG, OR-03 delegate) — ingestion FEEDS it;
  playbooks CONSTRAIN it. Wire both INTO the orchestrator run (OR-06), not beside it.
- The CANONICAL STORE (FIX-K) — collaboration syncs it; the shot plan/timeline/cast live in it.
- The RAG (OR-02 + SPEC-style-memory-rag) — ingestion embeds INTO it.
- CAST / LOCATION / VOICES (VaultCharacter + Training Studio) — ingestion creates/links these.
- IDEMPOTENCY (BP-02) — collaboration relies on it for concurrent generation.
- FORGEREVIEW — collaboration extends it (comments/versions → live co-edit).
- The CHOKEPOINT (BP-01) — every paid understand/generate call routes through it.

## OUTPUT CONTRACT (every prompt)
State files changed; make the change per the DETAILED spec (no interpretation); WIRE to the
named dependencies (don't stub the connections); add the acceptance test; run tsc +
check:chokepoints; report; STOP + report if a dependency's actual shape differs from the
spec's assumption (reconcile, don't guess).

## NEXT: workflow-parity complete (WF-01, WF-02, WF-03 fed).
