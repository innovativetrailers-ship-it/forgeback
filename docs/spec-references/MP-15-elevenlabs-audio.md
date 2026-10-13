# MP-15 — ELEVENLABS AUDIO family (the full audio toolkit on FAL).
# CURSOR PROMPT. Obey INV-1..8 + MP-00. Reference: FAMILY-12-elevenlabs.md.
# ⚠ A SEPARATE audio provider path (not the video mode router). All gated (paid FAL calls).
# Verify each via OpenAPI + fal.ai/models/fal-ai/elevenlabs/<endpoint>/llms.txt.

## STATUS: the WHOLE audio stack runs on FAL_KEY (voice/dialogue/music/SFX/dubbing/clone/
## design/alignment/isolation/STT). CONFIRMS the audio layer (SPEC-elevenlabs-integration) on FAL.

## TASK 1 — VERIFY the endpoints (OpenAPI + llms.txt)
TTS (dialogue/narration):
[ ] fal-ai/elevenlabs/tts/eleven-v3  (flagship — emotional, stability param, streaming)
[ ] fal-ai/elevenlabs/tts/multilingual-v2 (29 lang)  | fal-ai/elevenlabs/tts/turbo-v2.5 (fast)
[ ] fal-ai/elevenlabs/text-to-dialogue/eleven-v3  (⚠ multi-speaker — 2+ char scenes, one call)
VOICES (Training Studio):
[ ] voice-cloner / audio-to-voice (clone from sample, $1.50) — verify exact id
[ ] voice-design / text-to-voice (design from description, $3) — verify exact id
AUDIO:
[ ] fal-ai/elevenlabs/sound-effects  |  Eleven Music (verify id)  |  fal-ai/elevenlabs/dubbing
[ ] speech-to-speech / voice-changer  |  fal-ai/elevenlabs/speech-to-text (Scribe v2)
[ ] fal-ai/elevenlabs/audio-isolation  |  forced-alignment (verify id — lip-sync timing)

## TASK 2 — REGISTRY: a separate AUDIO provider path
```typescript
// NOT in the video mode router. An audio provider with its own builder + endpoints.
export const audioModels = {
  tts:        'fal-ai/elevenlabs/tts/eleven-v3',
  dialogue:   'fal-ai/elevenlabs/text-to-dialogue/eleven-v3',
  voiceClone: 'fal-ai/elevenlabs/voice-cloner',   // verify
  voiceDesign:'fal-ai/elevenlabs/...',            // verify
  sfx:        'fal-ai/elevenlabs/sound-effects',
  music:      'fal-ai/elevenlabs/...',            // Eleven Music, verify
  dubbing:    'fal-ai/elevenlabs/dubbing',
  s2s:        'fal-ai/elevenlabs/...',            // speech-to-speech, verify
  stt:        'fal-ai/elevenlabs/speech-to-text',
  isolate:    'fal-ai/elevenlabs/audio-isolation',
  align:      'fal-ai/elevenlabs/...',            // forced-alignment, verify
}
export async function buildAudioPayload(kind, req) { /* per-endpoint payloads */ }
```

## TASK 3 — WIRE into the pipeline (the audio layer, SPEC-elevenlabs-integration)
[ ] CHARACTER VOICE: voice-clone (sample) OR voice-design (description) → stored voiceId
    (Training Studio VOICES). Dialogue → tts/eleven-v3 with that voiceId.
[ ] DIALOGUE SCENE (2+ chars): text-to-dialogue (multi-speaker, one call).
[ ] LIP-SYNC: forced-alignment → word timestamps → drive the lip-sync bind.
[ ] SFX: sound-effects. MUSIC: Eleven Music. DUBBING: dubbing (film-level, timing preserved).
[ ] PERFORMANCE: speech-to-speech (your read → character voice). PREP: audio-isolation, STT.
All gated (INV-1 — paid FAL calls), on the chokepoint.

## TASK 4 — Orchestrator audio routing (Omni-native vs ElevenLabs)
The orchestrator chooses per shot:
- Omni/Seedance/Veo/Grok (native audio) → audio IN the generation pass (simple).
- ElevenLabs → when quality/dubbing/cloning/design is wanted, OR the video model has no
  native voice, OR a multi-speaker dialogue / lip-sync-to-clip is needed.
Both valid; the orchestrator routes audio like it routes video (by need + quality/cost).

## TASK 5 — TEST: clone a voice → TTS a line → (multi-speaker) dialogue → SFX → forced-
alignment for lip-sync → dubbing a clip. Each validates + one gen; all gated. tsc green.

## GATE: audio endpoints verified; separate audio builder; voice clone+design in the
Training Studio; forced-alignment as lip-sync timing; all gated. check:chokepoints green.
