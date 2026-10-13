# WF-01 — PROJECT CONTEXT INGESTION. CURSOR PROMPT. Obey INV-1..8 + WF-00.
# Reference: SPEC-A2-project-context-ingestion. Drop any file/link → understood → the
# orchestrator knows it. ⚠ WIRE to: the RAG (OR-02), premise-lock (OR-01), Cast/Location/
# Voices, the canonical store (FIX-K), the chokepoint (BP-01). Do NOT build in isolation.

## TASK 1 — Detect + route by type (the ingestion entry point)
```typescript
async function ingest(input: File|URL, projectId): IngestResult {
  const type = await detectType(input)   // mime + content sniff + extension
  // route to the right parser (Task 2). type ∈ {script, treatment, character_ref,
  // location_ref, rough_cut, style_ref, link, pdf, audio_sample, unknown}
}
```
For 'unknown', fall back to: extract text if possible → treat as project note/context.

## TASK 2 — Parse per type (the right parser each)
- SCRIPT (txt/fountain/pdf-text): run the existing script breakdown → scenes/shots/characters.
- TREATMENT/BRIEF (pdf/doc): extract text → the premise fields (premise, tone, refs).
- CHARACTER_REF (image/video): store as a reference + generate an embedding.
- LOCATION_REF (image): store as a location plate + embedding.
- ROUGH_CUT (video): FFmpeg scene-detect → shot boundaries; sample frames → a style read.
- STYLE_REF (image/video): sample frames → measured look (palette/contrast/framing) + embedding.
- LINK/URL: web_fetch → text → summarise.
- PDF (any): extract text (the pdf skill/pdftotext) → chunks.
- AUDIO_SAMPLE: store as a voice-clone candidate (→ Training Studio Voices).
Use the REAL existing parsers where they exist (script breakdown, scene-detect, the style
measured-look from SPEC-style-memory-rag); build the missing ones.

## TASK 3 — UNDERSTAND (classify + describe vs the project) — GATED
```typescript
// A gated call (claudeCall + a vision model where visual): read the parsed input, classify
// it, and describe what it MEANS for THIS project + where it fits.
async function understand(parsed, project): { role, description, links }
// e.g. "character reference of a grey alien → link to Cast 'Grey'"; "Act 2 treatment →
// premise refinement"; "rough cut of scene 3 → style + shot boundaries".
```
GATED (INV-1 — paid LLM/vision call, source:'ingest.understand', mechanical/creative tier).

## TASK 4 — EMBED + LINK (into the RAG + the right project element)
- EMBED the input (pgvector) → the project RAG + (for style/character) the style-memory RAG.
- LINK to the right entity: script→shot plan+cast; treatment→premise-lock; character_ref→
  a Cast/VaultCharacter entity; location_ref→a Location; rough_cut→style+boundaries;
  audio→Voices. CREATE the entity if new; link if existing (match by name/embedding).
- All links write the CANONICAL store / the real entities (FIX-K, VaultCharacter, Location) —
  NOT a separate ingestion silo (INV-2).

## TASK 5 — FEED THE ORCHESTRATOR (the payoff — wire it)
- The premise-lock (OR-01) READS ingested treatments/briefs → the film stays true to them.
- The RAG (OR-02) INCLUDES ingested refs → retrieval-by-need returns them.
- The cast/location ingested → routable in generation (consistency/reference).
- CONFIRM the orchestrator run (OR-06) reads the ingested context — the "agent knows what
  you know" is only real if the orchestrator actually consumes it. Wire + test this link.

## ACCEPTANCE
[ ] each input type is detected, parsed by the right parser, understood (gated), embedded, linked.
[ ] a treatment feeds the premise-lock; a character image → a Cast entity; a rough cut →
    boundaries+style; a script → a shot plan; a PDF → searchable context; audio → a voice candidate.
[ ] links write the REAL entities/canonical store (no ingestion silo).
[ ] the orchestrator READS the ingested context (premise-lock + RAG) — tested end-to-end.
[ ] understand step gated (INV-1); content stored per privacy/consent (data/rights).
[ ] tsc + check:chokepoints green.

## NEXT: WF-02 (playbooks).
