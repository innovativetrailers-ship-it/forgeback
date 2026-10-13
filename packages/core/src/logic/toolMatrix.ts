/**
 * Tool exposure for MP-12. A control may be shown only where status is 'schema'.
 * Seedance 2.0 and Kling 3.0 cells were read from the OpenAPI inputs for those families.
 * Every other family stays 'unverified' until its own prompt fetches the schema.
 * Native audio is on the Seedance schema and is not exposed: live submit forces
 * generate_audio false. No new control is mounted from this table.
 */

export type ToolCell = 'schema' | 'absent' | 'unverified'

export interface ToolExposureRow {
  model: string
  wired: boolean
  camera: ToolCell
  reference: ToolCell
  firstLast: ToolCell
  nativeAudio: ToolCell
  exposeNativeAudio: boolean
  voice: ToolCell
  seed: ToolCell
  negative: ToolCell
  /** Video file reference. Schema-confirmed for Wan 3.0, Seedance 2.0, and Gemini Omni. */
  videoReference?: ToolCell
  note?: string
}

export const TOOL_EXPOSURE: ToolExposureRow[] = [
  {
    model: 'seedance-2.0',
    wired: true,
    camera: 'schema',
    reference: 'schema',
    firstLast: 'schema',
    nativeAudio: 'schema',
    exposeNativeAudio: false,
    voice: 'schema',
    seed: 'absent',
    negative: 'absent',
    videoReference: 'schema',
    note: 'Camera is prompt text. Reference files are image_urls, video_urls, audio_urls with @ tags. generate_audio stays false on submit. 2.5 endpoints verified and not in the pool.',
  },
  {
    model: 'kling-3.0',
    wired: true,
    camera: 'schema',
    reference: 'schema',
    firstLast: 'schema',
    nativeAudio: 'schema',
    exposeNativeAudio: false,
    voice: 'absent',
    seed: 'absent',
    negative: 'schema',
    note: 'Elements live on image-to-video as frontal_image_url plus up to 3 reference images. Prompt names them @Element1. The /elements id 404s. The v3 input has no voice_id, so the voice control stays hidden. generate_audio stays false. No resolution field.',
  },
  { model: 'veo-3.1', wired: true, camera: 'schema', reference: 'schema', firstLast: 'schema', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'unverified', seed: 'schema', negative: 'schema', note: 'Text is fal-ai/veo3.1. /text-to-video 404s. First/last uses first_frame_url and last_frame_url. Reference files are image_urls, duration locked to 8s. Extend duration is 7s and resolution 720p. generate_audio stays false. auto_fix is not sent.' },
  { model: 'wan-2.7', wired: true, camera: 'schema', reference: 'schema', firstLast: 'schema', nativeAudio: 'absent', exposeNativeAudio: false, voice: 'absent', seed: 'schema', negative: 'schema', note: 'Wan 2.6 ids 404. Duration is an integer 2-15 (reference 2-10). Reference files are reference_image_urls, not # tags. Prompt cap 5000. No generate_audio. Prompt expansion is sent false. fal-ai/wan/v2.7/edit is an image edit and is not video_edit. This stays the pool model.' },
  { model: 'wan-3.0', wired: true, camera: 'schema', reference: 'schema', firstLast: 'schema', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'absent', seed: 'schema', negative: 'absent', videoReference: 'schema', note: 'Prefix is alibaba/wan-3.0. First frame is start_image_url. Last frame is end_image_url. Reference files are reference_image_urls (10) and reference_video_urls (5), not # tags. Duration is an integer 2-30. Prompt cap 20000. audio is sent false. Prompt expansion is sent false. Prime is verified and not this id. Not in the default council.' },
  { model: 'happyhorse-1.0', wired: true, camera: 'schema', reference: 'schema', firstLast: 'absent', nativeAudio: 'absent', exposeNativeAudio: false, voice: 'absent', seed: 'schema', negative: 'absent', note: 'Unversioned alibaba/happy-horse. Text has no image_url. Image requires image_url and has no aspect. Reference files are image_urls, cap 9, named character1. Duration is an integer 3-15. Prompt cap 2500. Video edit requires video_url. v1.1 is verified, has no video-edit, and is not this id. Not in the default council until one clean generation.' },
  { model: 'hailuo', wired: true, camera: 'schema', reference: 'absent', firstLast: 'schema', nativeAudio: 'absent', exposeNativeAudio: false, voice: 'absent', seed: 'absent', negative: 'absent', note: 'Registry id hailuo-02 uses 02 pro. Prompt cap 2000. Pro text has no duration. Pro image last frame is end_image_url. Fast image duration is "6" or "10". No reference endpoint and no audio_url. prompt_optimizer is sent false. 2.3 is verified and not this id.' },
  { model: 'grok-imagine-video', wired: true, camera: 'schema', reference: 'schema', firstLast: 'absent', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'absent', seed: 'absent', negative: 'absent', note: 'FAL xai/grok-imagine-video/v1.5. Text, image, and reference are live. Image field is image_url and has no last frame. Reference files are reference_image_urls, max 7, tagged <IMAGE_0>. Duration is an integer 1-15. Prompt cap 4096. No audio field, so native audio stays on. The unversioned endpoints are verified and not this id. Direct xAI stays retired.' },
  { model: 'pixverse-v5.6', wired: true, camera: 'schema', reference: 'absent', firstLast: 'schema', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'absent', seed: 'schema', negative: 'schema', note: 'v5.6 text and image are live. Last frame is fal-ai/pixverse/v5.6/transition with first_image_url and end_image_url. Duration is "5"|"8"|"10", and 1080p cannot be 10. Prompt cap is 2048 UTF-8 bytes. generate_audio_switch is sent false. thinking_type is sent disabled. No fusion field and no motion_mode. v5.6 effects and reference 404. Not in the default council.' },
  { model: 'ltx-2.3-fast', wired: true, camera: 'schema', reference: 'absent', firstLast: 'schema', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'absent', seed: 'absent', negative: 'absent', note: 'Draft tier. Text is fal-ai/ltx-2.3/text-to-video/fast. Image is fal-ai/ltx-2.3/image-to-video, and last frame is end_image_url. Fast duration is 6-20; durations above 10 force 1080p and 25 fps. Full image duration is 6|8|10. Resolution is 1080p|1440p|2160p. Prompt cap 5000. generate_audio is sent false. Audio-to-video exists and is not a shot mode. ltx-2.5 404s. No multi-keyframe endpoint.' },
  { model: 'gemini-omni', wired: true, camera: 'schema', reference: 'schema', firstLast: 'schema', nativeAudio: 'schema', exposeNativeAudio: false, voice: 'absent', seed: 'absent', negative: 'absent', videoReference: 'schema', note: 'v1.1 google/gemini-omni-flash. Image field is image_url, last frame is end_image_url on the same image endpoint. Reference files are image_urls (10) and reference_video_urls (3), tagged <IMAGE_REF_N> / <VIDEO_REF_N>. Edit is /v1.1/edit with prompt + video_url, no duration. Duration 3-10 integer. Resolution 360p|720p|1080p|4k. Aspect 16:9|9:16. No generate_audio field. No seed. Unified v1.1, fal-ai/ prefix, Omni Audio, and Omni Character 404. Primary quality t2v; Veo stays for 4K and long takes.' },
]
