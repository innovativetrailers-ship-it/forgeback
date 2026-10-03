# SPEC — A2: PROJECT CONTEXT INGESTION ("the agent knows what you know")
# Parity gap vs InVideo Agent Two ("understands everything you upload — videos, scripts,
# PDFs, links, rough cuts — read against your project's Context, knows what each means +
# where it fits"). Extends the orchestrator's RAG + memory. Obey INV-1..8.

═══════════════════════════════════════════════════════════════════════
# WHAT IT IS
═══════════════════════════════════════════════════════════════════════
Drop ANY file/link into a project → the system PARSES it, UNDERSTANDS what it is, EMBEDS
it, and LINKS it to the right project element — so the orchestrator reads it as context.
The "agent knows what you know" promise: no re-explaining the treatment every session.

═══════════════════════════════════════════════════════════════════════
# SUPPORTED INPUTS + WHAT HAPPENS TO EACH
═══════════════════════════════════════════════════════════════════════
| Input | Parsed to | Linked to |
|---|---|---|
| SCRIPT (txt/fountain/pdf) | scenes/shots/characters (breakdown) | the shot plan + cast |
| TREATMENT / BRIEF (pdf/doc) | premise, tone, references | the premise-lock (OR-01) |
| CHARACTER REF (image/video) | a character reference + embedding | a Cast entity + RAG |
| LOCATION REF (image) | a location plate + embedding | a Location entity |
| ROUGH CUT (video) | shot boundaries (scene-detect) + a style read | reference / style |
| STYLE REF (image/video) | a style descriptor + measured look | style/genre + RAG |
| LINK/URL | fetched + summarised (web content) | project notes/context |
| PDF (any) | text extracted + embedded | project context, searchable |
| AUDIO (voice sample) | a voice-clone candidate | Voices (Training Studio) |

═══════════════════════════════════════════════════════════════════════
# THE INGESTION PIPELINE
═══════════════════════════════════════════════════════════════════════
```
upload/link → 1. DETECT type (mime + content sniff)
            → 2. PARSE per type (script breakdown / PDF text / frame sample / transcript /
                  scene-detect / web fetch) — the right parser per input
            → 3. UNDERSTAND: a VLM/LLM (gated claudeCall + a vision model, e.g. the SAM3/
                  a caption model / Liquid-VLM later) reads it → "this is a character
                  reference of MAYA" / "this is the Act 2 treatment" / "this is a rough cut
                  of scene 3". Classify + describe against the PROJECT (what it means, where it fits).
            → 4. EMBED (pgvector) + LINK to the project element (cast/location/scene/style/notes).
            → 5. The orchestrator's RAG + premise-lock now INCLUDE it — it's context the
                  director reasons with (OR-01/OR-02).
```
Gated (INV-1 — the understand step is a paid LLM/vision call). Stored per user (privacy —
uploaded content is the user's, not repurposed; the data/rights rule).

═══════════════════════════════════════════════════════════════════════
# HOW IT FEEDS THE ORCHESTRATOR
═══════════════════════════════════════════════════════════════════════
- A dropped TREATMENT → feeds the premise-lock (OR-01) → the whole film stays true to it.
- A dropped CHARACTER REF → a Cast entity → consistency routing + (optionally) a trained LoRA.
- A dropped ROUGH CUT → style read + shot boundaries → informs pacing/style.
- Everything embedded → the model-knowledge + project RAG → the orchestrator "knows what
  you know" and never asks you to re-explain.

## ACCEPTANCE
[ ] dropping a script → a shot plan + cast; a treatment → the premise-lock; a character
    image → a Cast entity; a rough cut → scene boundaries + style read; a PDF → searchable context.
[ ] each input is TYPE-DETECTED, PARSED, UNDERSTOOD (classified + described vs the project),
    EMBEDDED, and LINKED to the right element.
[ ] the orchestrator reads the ingested context (premise-lock + RAG include it).
[ ] the understand step is gated (paid LLM/vision call); content stored per privacy rules.
[ ] tsc + check:chokepoints green.

## NET
Drop any file/link → detected, parsed, understood against the project, embedded, linked →
the orchestrator knows it. Closes the "Context" gap vs Agent Two ("the agent knows what you
know"). Extends the RAG + premise-lock. Gated + privacy-respecting.
