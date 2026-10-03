# ORCHESTRATOR BUILD PROMPTS — INDEX & RULES (Cursor)
# Implements SPEC-orchestrator-the-director-brain + SPEC-user-rating-and-learning.
# The orchestrator = the informed director-brain: interprets scripts faithfully, knows
# every model via a live RAG, delegates by purpose weighing quality-vs-budget, learns
# from ratings. Feed ONE per session. Obey INV-1..8 from BP-00.

═══════════════════════════════════════════════════════════════════════
# ⚠ SEQUENCING (read first)
═══════════════════════════════════════════════════════════════════════
The orchestrator sits ON TOP of a working generation pipeline. Build order:
1. FIRST: the model-family pipeline (MP-01..13) — shots generate on the right endpoints.
   The orchestrator DELEGATES to those models; they must work before it can command them.
2. THEN these orchestrator prompts. OR-01 (interpret) can be built early (it's the
   cognitive director + premise lock, independent of delegation). OR-02..05 depend on
   the pipeline + the tool matrix (MP-02b Part D) existing.

═══════════════════════════════════════════════════════════════════════
# THE CHUNKS (feed in order)
═══════════════════════════════════════════════════════════════════════
OR-01  INTERPRET — premise lock + grounded faithful expansion (script → shot plan that
       stays true to the premise). Extends the cognitive director. Fixes drift structurally.
OR-02  MODEL-KNOWLEDGE RAG — index each model (doc + live schema + learned outcomes);
       retrieve BY NEED, not by name. The orchestrator's live knowledge.
OR-03  DELEGATE — ShotPurpose + delegate() scoring by purpose-fit + quality-vs-budget +
       learned performance; logs the reason. Wires the MoE gate to the RAG.
OR-04  LEARN — the RLAIF loop: outcomes (behavioural) + the RewardSignal consumer →
       per-(model,purpose) performance → feeds OR-02's learned layer + OR-03's gate.
OR-05  RATING SYSTEM — attributable shot-level ratings (shot+model+purpose+score+why);
       the high-signal overlay on OR-04; the taste profile.
OR-06  THE UNIFIED RUN — compose the four jobs into the orchestrator's pipeline
       (interpret → delegate → generate/chain → gate → learn → assemble).

═══════════════════════════════════════════════════════════════════════
# INVARIANTS (every prompt)
═══════════════════════════════════════════════════════════════════════
- All LLM calls through claudeCall (gated, source, tier — INV-1). Interpret stages =
  hard/creative tier; grounding check + extraction = mechanical.
- Delegation NEVER silently substitutes the user's manual model choice (INV-5).
- The RAG's model knowledge is DATA (indexed/retrieved), never a hardcoded table that
  goes stale — it must survive new models/deprecations.
- Ratings + taste profile are the USER'S OWN DATA (privacy/consent rules).
- Additive migrations (INV-7). Desktop/web parity via @cinema/core (INV-8).

## OUTPUT CONTRACT (every prompt)
State files changed; make the change per the detailed spec; add the acceptance test;
run tsc + check:chokepoints; touch only this job's scope; report; STOP + report if the
code doesn't match an assumption (don't guess).

## NEXT: OR-01 (interpret — premise lock + grounded expansion).
