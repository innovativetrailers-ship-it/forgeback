/**
 * ElevenLabs on FAL. Audio provider path — not the video mode router.
 * OpenAPI probed 2026-09-25. Schema wins over FAMILY-12.
 *
 * Live (200):
 *   fal-ai/elevenlabs/tts/eleven-v3 — required text. voice, stability 0-1, timestamps.
 *     Prompt maxLength 5000. No similarity_boost on v3.
 *   fal-ai/elevenlabs/tts/multilingual-v2, tts/turbo-v2.5 — required text.
 *     Extra fields: similarity_boost, style, speed 0.7-1.2.
 *   fal-ai/elevenlabs/text-to-dialogue/eleven-v3 — required inputs[].
 *     Each block is { text, voice } — not voice_id.
 *   fal-ai/elevenlabs/clone-voice — required audio_urls. Optional remove_background_noise.
 *     $0.50/clone. voice-cloner / voice-clone / audio-to-voice — 404.
 *   fal-ai/elevenlabs/sound-effects — required text (max 450). duration_seconds, prompt_influence.
 *   fal-ai/elevenlabs/music — prompt or composition_plan. music_length_ms, force_instrumental.
 *     music/v2 and music/v2.5 also 200. Not this id.
 *   fal-ai/elevenlabs/dubbing — required target_lang. audio_url or video_url.
 *   fal-ai/elevenlabs/voice-changer — required audio_url. Optional voice. speech-to-speech — 404.
 *   fal-ai/elevenlabs/speech-to-text — required audio_url. diarize, tag_audio_events.
 *   fal-ai/elevenlabs/audio-isolation — audio_url or video_url.
 *   fal-ai/elevenlabs/forced-alignment — required audio_url + text. Words have start/end seconds.
 *
 * Unverified (404): voice-design, text-to-voice, voice-cloner, audio-to-voice, speech-to-speech.
 * Voice design stays on the direct ElevenLabs API until a FAL id returns 200.
 * Overlay still silences video generate_audio except Grok. Omni has no audio field.
 */
export declare const ELEVENLABS_TTS = "fal-ai/elevenlabs/tts/eleven-v3";
export declare const ELEVENLABS_TTS_MULTILINGUAL = "fal-ai/elevenlabs/tts/multilingual-v2";
export declare const ELEVENLABS_TTS_TURBO = "fal-ai/elevenlabs/tts/turbo-v2.5";
export declare const ELEVENLABS_DIALOGUE = "fal-ai/elevenlabs/text-to-dialogue/eleven-v3";
export declare const ELEVENLABS_CLONE = "fal-ai/elevenlabs/clone-voice";
export declare const ELEVENLABS_SFX = "fal-ai/elevenlabs/sound-effects";
export declare const ELEVENLABS_MUSIC = "fal-ai/elevenlabs/music";
export declare const ELEVENLABS_DUBBING = "fal-ai/elevenlabs/dubbing";
export declare const ELEVENLABS_S2S = "fal-ai/elevenlabs/voice-changer";
export declare const ELEVENLABS_STT = "fal-ai/elevenlabs/speech-to-text";
export declare const ELEVENLABS_ISOLATE = "fal-ai/elevenlabs/audio-isolation";
export declare const ELEVENLABS_ALIGN = "fal-ai/elevenlabs/forced-alignment";
export declare const audioModels: {
    readonly tts: "fal-ai/elevenlabs/tts/eleven-v3";
    readonly dialogue: "fal-ai/elevenlabs/text-to-dialogue/eleven-v3";
    readonly voiceClone: "fal-ai/elevenlabs/clone-voice";
    readonly sfx: "fal-ai/elevenlabs/sound-effects";
    readonly music: "fal-ai/elevenlabs/music";
    readonly dubbing: "fal-ai/elevenlabs/dubbing";
    readonly s2s: "fal-ai/elevenlabs/voice-changer";
    readonly stt: "fal-ai/elevenlabs/speech-to-text";
    readonly isolate: "fal-ai/elevenlabs/audio-isolation";
    readonly align: "fal-ai/elevenlabs/forced-alignment";
};
export declare const ELEVENLABS_ENDPOINTS: {
    readonly tts: "fal-ai/elevenlabs/tts/eleven-v3";
    readonly dialogue: "fal-ai/elevenlabs/text-to-dialogue/eleven-v3";
    readonly voiceClone: "fal-ai/elevenlabs/clone-voice";
    readonly sfx: "fal-ai/elevenlabs/sound-effects";
    readonly music: "fal-ai/elevenlabs/music";
    readonly dubbing: "fal-ai/elevenlabs/dubbing";
    readonly s2s: "fal-ai/elevenlabs/voice-changer";
    readonly stt: "fal-ai/elevenlabs/speech-to-text";
    readonly isolate: "fal-ai/elevenlabs/audio-isolation";
    readonly align: "fal-ai/elevenlabs/forced-alignment";
};
export declare const ELEVENLABS_VERIFIED_NOT_THIS_ID: {
    readonly musicV2: "fal-ai/elevenlabs/music/v2";
    readonly musicV25: "fal-ai/elevenlabs/music/v2.5";
    readonly ttsV3Stream: "fal-ai/elevenlabs/tts/eleven-v3/stream";
};
export declare const ELEVENLABS_UNVERIFIED_IDS: readonly ["fal-ai/elevenlabs/voice-clone", "fal-ai/elevenlabs/voice-cloner", "fal-ai/elevenlabs/voice-design", "fal-ai/elevenlabs/text-to-voice", "fal-ai/elevenlabs/audio-to-voice", "fal-ai/elevenlabs/speech-to-speech"];
export declare const ELEVENLABS_TTS_MAX = 5000;
export declare const ELEVENLABS_SFX_MAX = 450;
export declare const ELEVENLABS_OUTPUT: "mp3_44100_128";
export declare const ELEVENLABS_OUTPUT_FORMATS: readonly ["mp3_22050_32", "mp3_44100_32", "mp3_44100_64", "mp3_44100_96", "mp3_44100_128", "mp3_44100_192", "pcm_8000", "pcm_16000", "pcm_22050", "pcm_24000", "pcm_44100", "pcm_48000", "ulaw_8000", "alaw_8000", "opus_48000_32", "opus_48000_64", "opus_48000_96", "opus_48000_128", "opus_48000_192"];
export type ElevenLabsKind = 'tts' | 'tts_multilingual' | 'tts_turbo' | 'dialogue' | 'clone' | 'sfx' | 'music' | 'dubbing' | 's2s' | 'stt' | 'isolate' | 'align';
export interface DialogueTurn {
    text: string;
    voice: string;
}
export interface AudioBuildRequest {
    text?: string;
    voice?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speed?: number;
    languageCode?: string;
    timestamps?: boolean;
    inputs?: DialogueTurn[];
    audioUrls?: string[];
    audioUrl?: string;
    videoUrl?: string;
    removeBackgroundNoise?: boolean;
    durationSeconds?: number;
    promptInfluence?: number;
    outputFormat?: string;
    prompt?: string;
    forceInstrumental?: boolean;
    musicLengthMs?: number;
    targetLang?: string;
    sourceLang?: string;
    numSpeakers?: number;
    diarize?: boolean;
    tagAudioEvents?: boolean;
}
export interface AudioBuilt {
    endpoint: string;
    payload: Record<string, unknown>;
}
export declare function buildAudioPayload(kind: ElevenLabsKind, req: AudioBuildRequest): AudioBuilt;
export interface VoiceModelResolution {
    kind: 'tts' | 'tts_turbo';
    requested: string;
    applied: 'eleven_v3' | 'turbo';
    reason: string;
}
/** Live OpenAPI 200: eleven-v3 and turbo-v2.5. A flash id returns 404. */
export declare function resolveVoiceModel(requested: string | undefined): VoiceModelResolution;
export declare function buildVoiceTakePayload(input: {
    text: string;
    voice: string;
    model?: string;
    stability?: number;
    similarity?: number;
    style?: number;
    speed?: number;
    emotion?: number;
}): AudioBuilt & {
    model: VoiceModelResolution;
};
export type AudioPath = 'native' | 'elevenlabs';
export interface AudioRouteInput {
    videoModel?: string;
    needsDialogue?: boolean;
    speakerCount?: number;
    wantsCloneOrDesign?: boolean;
    wantsDubbing?: boolean;
    wantsLipSync?: boolean;
    wantsQualityVoice?: boolean;
}
export interface AudioRoute {
    path: AudioPath;
    reason: string;
    kind?: ElevenLabsKind;
}
/** Overlay: dispatch silences every video model except Grok. Omni has no audio toggle. */
export declare function routeShotAudio(input: AudioRouteInput): AudioRoute;
export declare function alignmentWords(data: unknown): Array<{
    text: string;
    start: number;
    end: number;
}>;
export declare function clonedVoiceId(data: unknown): string;
