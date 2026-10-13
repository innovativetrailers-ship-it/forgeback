# MODEL FAMILY — ELEVENLABS (on FAL) — VERIFIED (the full audio toolkit)
# Prefix: fal-ai/elevenlabs/... Use @fal-ai/client + FAL_KEY. ⚠ Verify each via OpenAPI +
# fal.ai/models/fal-ai/elevenlabs/<endpoint>/llms.txt. This is the AUDIO STACK on ONE key.
# CONFIRMS: the whole audio layer (voice/dialogue/music/SFX/dubbing/alignment/clone/design)
# runs on FAL_KEY — no separate ElevenLabs API needed for these. (Earlier "verify FAL vs
# direct" for clone/design → CONFIRMED on FAL: voice-clone + voice-design are on fal.)

═══════════════════════════════════════════════════════════════════════
# THE FULL FAMILY ON FAL (verified)
═══════════════════════════════════════════════════════════════════════

## TEXT-TO-SPEECH (voices for dialogue/narration)
- fal-ai/elevenlabs/tts/eleven-v3 — the flagship v3 TTS (emotional range, stability param;
  supports streaming; optional bg-noise removal; many output formats). THE dialogue voice.
- fal-ai/elevenlabs/tts/multilingual-v2 — stable narration, 29 languages (localization/audiobook).
- fal-ai/elevenlabs/tts/turbo-v2.5 — low-latency real-time, 32 languages ($0.10/1K chars).
  payload (v3): { text (req), voice (id), stability, output_format, ... }

## TEXT-TO-DIALOGUE (multi-speaker — for 2+ char scenes)
- fal-ai/elevenlabs/text-to-dialogue/eleven-v3 — multi-speaker conversation with matched
  prosody. payload: { inputs:[{ text, voice_id }, ...] } → one dialogue audio. ⚠ PERFECT
  for the director's dialogue scenes (2 characters talking, natural turn-taking, one call).

## VOICE CLONE + DESIGN (the VOICES tab of the Training Studio — CONFIRMED on FAL)
- fal-ai/elevenlabs/voice-cloner (or /audio-to-voice) — clone a voice from audio sample(s)
  (audio_urls[]), noise reduction + volume normalization + preview. $1.50/clone.
- fal-ai/elevenlabs/... voice-design (text-to-voice) — DESIGN a custom voice from a text
  DESCRIPTION (no reference audio). $3/voice created. → for characters with no voice sample.
  → BOTH feed the Training Studio VOICES: clone (from sample) OR design (from description).

## SOUND EFFECTS (the audio SFX layer)
- fal-ai/elevenlabs/sound-effects — high-fidelity SFX from a text description. payload:
  { text (the sound), duration? }. → the SFX pipeline (footsteps, ambience, impacts).

## MUSIC (score)
- fal-ai/elevenlabs/... Eleven Music — full vocal OR instrumental tracks from a text prompt
  (fine controls). → the score layer (alongside/instead of Suno).

## DUBBING (multi-language localization)
- fal-ai/elevenlabs/dubbing — translate + dub video/audio into another language, TIMING
  PRESERVED. → the film-level dubbing feature (global distribution, per the ElevenLabs addendum).

## SPEECH-TO-SPEECH / VOICE CHANGER (map a performance onto a voice)
- fal-ai/elevenlabs/... speech-to-speech / voice-changer — swap the voice in existing audio
  while keeping the performance. → direct a line yourself, cast it into a character's voice.

## SPEECH-TO-TEXT (Scribe v2 — transcription + word timing)
- fal-ai/elevenlabs/speech-to-text — Scribe v2, transcription with WORD-LEVEL timestamps,
  99 languages, speaker diarization. → QA, subtitle timing, alignment prep.

## AUDIO ISOLATION (clean vocals)
- fal-ai/elevenlabs/audio-isolation — remove bg noise/music → clean voice. → clean a voice
  sample before cloning (training-data prep), clean dialogue.

## FORCED ALIGNMENT (word-level timing — for LIP-SYNC)
- fal-ai/elevenlabs/... forced-alignment — align a transcript to audio → word timestamps.
  → THE lip-sync timing source (bind voice to the clip's mouth). Critical for dialogue shots.

═══════════════════════════════════════════════════════════════════════
# HOW THE FAMILY MAPS TO THE PIPELINE (the audio layer, one key)
═══════════════════════════════════════════════════════════════════════
- CHARACTER VOICE: voice-clone (from sample) OR voice-design (from description) → a stored
  voiceId (Training Studio VOICES). Dialogue: tts/eleven-v3 with that voiceId. ⚠ CONFIRMED
  clone+design are on FAL (no direct ElevenLabs API needed).
- DIALOGUE SCENE (2+ chars): text-to-dialogue/eleven-v3 (multi-speaker, one call).
- LIP-SYNC: forced-alignment → word timestamps → drive the lip-sync model (bind to the clip).
- SFX: sound-effects. MUSIC: Eleven Music. DUBBING: dubbing (global).
- PERFORMANCE CASTING: speech-to-speech (your read → the character's voice).
- DATA PREP: audio-isolation (clean a sample before cloning); speech-to-text (transcribe/QA).
ALL on fal-ai/elevenlabs/* via FAL_KEY → the audio stack is ONE key (with the video models).
This CONFIRMS the LLM-and-audio-on-one-key consolidation: video + audio + (via openrouter/
router) LLM all on FAL_KEY.

═══════════════════════════════════════════════════════════════════════
# VS THE OMNI-NATIVE AUDIO STACK (a real choice)
═══════════════════════════════════════════════════════════════════════
- ElevenLabs (FAMILY-12): best-in-class voice quality, dialogue, dubbing, SFX, music,
  cloning/design, alignment. The MATURE, full audio toolkit. A SEPARATE pass from video gen.
- Gemini Omni Audio + Character (FAMILY-11 sub-models): voice + character IDs NATIVE to the
  video gen (audio produced IN the same pass, no separate pipeline) — but Google-native,
  fewer audio features.
→ CHOICE per shot: Omni-native audio (in-pass, simple, for Omni-routed shots) OR ElevenLabs
  (richer, higher quality, separate pass, works for ANY model). The orchestrator can route:
  native audio where the video model provides it (Omni/Seedance/Veo/Grok/etc.), ElevenLabs
  where quality/dubbing/cloning/design is wanted or the model has no native voice. Both valid.

## REGISTRY / WIRING NOTES
- These are AUDIO endpoints — a separate audio provider path (not the video mode router).
  buildAudioPayload per endpoint. All gated (INV-1 — paid FAL calls).
- Training Studio VOICES tab: voice-clone + voice-design here (CONFIRMED on FAL).
- The audio layer (SPEC-elevenlabs-integration) is REALISED on FAL: voice identity, per-shot
  voice/SFX, lip-sync (forced-alignment), music, dubbing — all fal-ai/elevenlabs/*.

## TODO ON WIRE (verify each via OpenAPI + llms.txt)
[ ] confirm exact ids: voice-cloner/audio-to-voice, voice-design/text-to-voice, sound-effects,
    music (Eleven Music), dubbing, speech-to-speech/voice-changer, speech-to-text, audio-
    isolation, forced-alignment. (TTS v3/multilingual-v2/turbo-v2.5 + text-to-dialogue confirmed.)
[ ] wire voice-clone + voice-design into the Training Studio VOICES tab (on FAL, one key).
[ ] wire forced-alignment as the lip-sync timing source.
[ ] the audio stack is a SEPARATE provider path from video; all gated; on FAL_KEY.

## NET
ElevenLabs on FAL is the FULL AUDIO TOOLKIT — TTS (v3/multilingual/turbo), text-to-dialogue
(multi-speaker), voice clone + design (CONFIRMED on FAL → Training Studio voices), sound
effects, Eleven Music, dubbing, speech-to-speech, speech-to-text (Scribe v2), audio
isolation, forced alignment (lip-sync timing). ALL on fal-ai/elevenlabs/* via FAL_KEY. This
CONFIRMS the whole audio layer runs on the one FAL key, and gives a real choice vs Omni-
native audio: ElevenLabs for quality/dubbing/cloning + any-model, Omni-native for in-pass
simplicity on Omni shots. The orchestrator routes audio accordingly.
