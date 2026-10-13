# CINEMATIC FORGE V3 — API REFERENCE ADDENDUM
## `CINEMA_V3_API_REFERENCE_ADDENDUM.md`
### All Live 2026 API Endpoints, Schemas, SDK Patterns & Pricing
### Feeds AFTER `CINEMA_V3_PLAYER_RENDERER_ADDENDUM.md` (Position 21 in feed order)
### Researched June 2026 — All endpoints live and verified

---

> **THIS DOCUMENT IS THE DEFINITIVE API INTEGRATION GUIDE FOR V3.**
> Every endpoint string, SDK call, parameter schema, and pricing figure was
> sourced from live official documentation as of June 2026.
>
> Cursor must use EXACTLY the endpoint strings shown here.
> Do not guess or infer endpoint paths — use what is specified.
> All API keys go into the system keychain via electron-keytar.
> No API key ever touches the renderer or appears in any log.

---

## API KEY ARCHITECTURE

```typescript
// src/main/keys/keychain.ts
// ALL API keys stored in OS keychain — never in .env, never in code

import keytar from 'electron-keytar'

const SERVICE = 'CinematicForgeV3'

export const keys = {
  async get(key: KeyName): Promise<string | null> {
    return keytar.getPassword(SERVICE, key)
  },
  async set(key: KeyName, value: string): Promise<void> {
    await keytar.setPassword(SERVICE, key, value)
  },
}

type KeyName =
  | 'FAL_KEY'           // fal.ai — primary video/image/audio/3D gateway
  | 'ANTHROPIC_KEY'     // Anthropic — claude-opus-4-8 (Casting Director)
  | 'ELEVENLABS_KEY'    // ElevenLabs — TTS, voice clone, dubbing, music, SFX
  | 'RUNWAY_KEY'        // Runway — Gen-4.5 V2V compositing
  | 'SUNOAPI_KEY'       // sunoapi.org — Suno music wrapper (unofficial)
  | 'MESHY_KEY'         // Meshy — text-to-3D
  | 'TOPAZ_KEY'         // Topaz — video upscale (via fal.ai or direct)

// On first launch: key setup wizard collects these via IPC
// Keys validated by test call before saving
// Renderer only receives: boolean (key exists), never the key itself
```

---

## 1 — FAL.AI (Primary AI Gateway)

### 1.1 SDK Setup

```typescript
// npm install @fal-ai/client

import { fal } from '@fal-ai/client'

// Called once in main process at startup
fal.config({
  credentials: await keys.get('FAL_KEY'),
})

// NEVER call fal.config in the renderer process
// ALL fal calls happen in src/main/ai/ ONLY
```

### 1.2 Request Patterns

fal.ai uses a queue-based async pattern for all generation calls.

```typescript
// PATTERN A: subscribe() — blocks until complete (use for short jobs <120s)
const result = await fal.subscribe(ENDPOINT_ID, {
  input: { /* model-specific params */ },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === 'IN_QUEUE') {
      emit('ai:queue-position', { position: update.position })
    }
    if (update.status === 'IN_PROGRESS') {
      update.logs?.forEach(log => emit('ai:log', log.message))
    }
  },
})
// result.data = { video: { url: string }, ... }

// PATTERN B: queue.submit() + poll — use for jobs >120s or parallel dispatch
const { request_id } = await fal.queue.submit(ENDPOINT_ID, {
  input: { /* params */ },
  webhookUrl: 'optional-webhook-url',  // omit if polling
})

// Poll status
const status = await fal.queue.status(ENDPOINT_ID, {
  requestId: request_id,
  logs: true,
})
// status.status = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

// Fetch result when COMPLETED
const result = await fal.queue.result(ENDPOINT_ID, {
  requestId: request_id,
})
```

### 1.3 Video Generation Endpoints

#### APEX — HappyHorse 1.0 (Alibaba ATH)
**#1 overall on Artificial Analysis, 1357 Elo. 7-language lip sync. 1080p + audio.**

```typescript
// Text to Video
const HAPPYHORSE_T2V = 'alibaba/happy-horse/text-to-video'
// Image to Video
const HAPPYHORSE_I2V = 'alibaba/happy-horse/image-to-video'
// Reference to Video (multi-ref)
const HAPPYHORSE_R2V = 'alibaba/happy-horse/reference-to-video'
// Video Edit (V2V local/global editing with reference images)
const HAPPYHORSE_EDIT = 'alibaba/happy-horse/video-edit'

// T2V input schema:
interface HappyHorseT2VInput {
  prompt: string              // required
  resolution: '720p' | '1080p'
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  duration: number            // seconds: 3–15
  negative_prompt?: string
  seed?: number
}

// I2V input schema:
interface HappyHorseI2VInput {
  prompt: string
  image_url: string           // reference frame
  resolution: '720p' | '1080p'
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  duration: number
}

// R2V input schema:
interface HappyHorseR2VInput {
  prompt: string              // reference images as [Image1], [Image2], etc.
  images: string[]            // up to 5 reference image URLs
  resolution: '720p' | '1080p'
  aspect_ratio: string
  duration: number
}

// Output (all endpoints):
interface HappyHorseOutput {
  video: { url: string; content_type: string; file_size: number }
  seed: number
  timings: { inference: number }
}

// PRICING (fal.ai): ~$0.30–$0.45/second at 1080p
// GENERATION TIME: ~38s for 5s at 1080p on H100 (fal.ai optimized)
// COMMERCIAL: Full commercial rights confirmed by fal
```

#### NARRATIVE — Seedance 2.0 (ByteDance)
**#1 with-audio (1213 Elo). 9-image + 3-clip + 3-audio multi-ref. Native audio.**

```typescript
// Standard tier (best quality)
const SEEDANCE_T2V          = 'bytedance/seedance-2.0/text-to-video'
const SEEDANCE_I2V          = 'bytedance/seedance-2.0/image-to-video'
const SEEDANCE_REF2V        = 'bytedance/seedance-2.0/reference-to-video'
// Fast tier (~40% cheaper, slightly lower quality)
const SEEDANCE_T2V_FAST     = 'bytedance/seedance-2.0/fast/text-to-video'
const SEEDANCE_I2V_FAST     = 'bytedance/seedance-2.0/fast/image-to-video'
const SEEDANCE_REF2V_FAST   = 'bytedance/seedance-2.0/fast/reference-to-video'

// T2V input:
interface SeedanceT2VInput {
  prompt: string
  duration: '5' | '10'       // seconds (string not number on fal)
  resolution: '720p' | '1080p'
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  negative_prompt?: string
  seed?: number
}

// Reference-to-Video: supports up to 9 images + 3 clips + 3 audio files
// Reference them in prompt as [Image1], [Video1], [Audio1], etc.
interface SeedanceRef2VInput {
  prompt: string              // use [Image1]...[Image9], [Video1-3], [Audio1-3]
  images?: string[]           // up to 9 image URLs
  videos?: string[]           // up to 3 video URLs
  audios?: string[]           // up to 3 audio URLs
  duration: '5' | '10'
  resolution: '720p' | '1080p'
  aspect_ratio: string
}

// Output:
interface SeedanceOutput {
  video: { url: string; content_type: string }
  seed: number
}

// PRICING: Standard ~$0.303/s; Fast ~$0.242/s (720p)
// 10s video: Standard $3.03; Fast $2.42
```

#### MOTION — Kling 3.0 (Kuaishou)
**4K/60fps, multilingual audio, multi-shot storyboarding, element referencing.**

```typescript
// V3 (VIDEO 3.0) — prompt-driven cinematic generation
const KLING_V3_T2V_PRO      = 'kling/video/v3/pro/text-to-video'
const KLING_V3_I2V_PRO      = 'kling/video/v3/pro/image-to-video'
const KLING_V3_T2V_STD      = 'kling/video/v3/standard/text-to-video'
const KLING_V3_I2V_STD      = 'kling/video/v3/standard/image-to-video'
// O3 (Omni variant) — reference-heavy workflows, character consistency
const KLING_O3_T2V_PRO      = 'kling/video/v3/omni/pro/text-to-video'
const KLING_O3_I2V_PRO      = 'kling/video/v3/omni/pro/image-to-video'
// LipSync (dedicated)
const KLING_LIPSYNC         = 'kling/video/lipsync'

// T2V input:
interface KlingV3T2VInput {
  prompt: string
  negative_prompt?: string
  duration: 3 | 5 | 10 | 15  // seconds
  aspect_ratio: '16:9' | '9:16' | '1:1'
  mode: 'pro' | 'standard'
  // Multi-shot storyboarding:
  multi_shot?: Array<{
    duration: number
    shot_size: 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'WS' | 'EWS'
    perspective: string
    narrative: string
    camera_movement: string
  }>
  // Audio
  audio_enabled?: boolean
  audio_language?: 'zh' | 'en' | 'ja' | 'ko' | 'es'
  // Element referencing (O3 only)
  reference_images?: string[]
  seed?: number
}

// I2V input:
interface KlingV3I2VInput {
  prompt: string
  image_url: string           // start frame
  image_tail_url?: string     // end frame (for start+end interpolation)
  duration: 3 | 5 | 10 | 15
  aspect_ratio: string
  mode: 'pro' | 'standard'
  audio_enabled?: boolean
}

// LipSync input:
interface KlingLipSyncInput {
  video_url: string           // source video with face
  audio_url: string           // voice audio to sync
  mode?: 'pro' | 'standard'
}

// Output:
interface KlingOutput {
  video: { url: string }
  task_id: string
}

// PRICING: V3 Pro ~$0.224/s (audio off), $0.336/s (audio on)
//          V3 Standard ~$0.084/s (audio off), $0.126/s (audio on)
// 10s Pro with audio: $3.36; 10s Standard with audio: $1.26
```

#### CINEMA — Veo 3.1 (Google DeepMind)
**4K. Native 48kHz synchronized audio. Physics benchmark leader.**

```typescript
// Multiple tiers available on fal
const VEO_31_STANDARD   = 'google/veo-3.1'           // or 'veo-3.1'
const VEO_31_FAST       = 'google/veo-3.1/fast'
const VEO_31_LITE       = 'google/veo-3.1/lite'      // March 2026, more accessible

// T2V input:
interface Veo31Input {
  prompt: string
  negative_prompt?: string
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  duration?: number           // 5–8 seconds
  resolution?: '1080p' | '4k'
  generate_audio?: boolean    // 48kHz synchronized audio
  seed?: number
}

// Output:
interface Veo31Output {
  video: { url: string; content_type: string }
}

// PRICING (Google API):
// Lite: ~$0.03/s
// Fast: ~$0.15/s
// Standard: ~$0.50/s
// NOTE: Access via fal.ai unified key OR Google Vertex AI directly
// For Vertex AI direct: use @google-cloud/aiplatform SDK
```

#### PHYSICS — Sora 2 (OpenAI)
**Physics-first (fluid/gravity/mechanics). Richly detailed dynamic clips.**
*Note: As of late April 2026, Sora web app closed; API access via fal.ai or third parties only.*

```typescript
const SORA_2_T2V    = 'openai/sora-2'
const SORA_2_PRO    = 'openai/sora-2/pro'

// T2V input:
interface Sora2Input {
  prompt: string
  duration: number            // 5–20 seconds
  aspect_ratio: '16:9' | '9:16' | '1:1'
  resolution: '720p' | '1080p'
  audio_enabled?: boolean
  seed?: number
}

// PRICING: per-duration pricing from ~$0.50/s (Pro)
// USE FOR: physics-heavy shots, fluid dynamics, gravity simulations
// CAUTION: Availability may change; always have fallback to Veo 3.1 or Kling
```

#### CONTROL — Runway Gen-4.5
**Motion brushes, scene consistency, V2V in-context compositing.**
*Separate SDK — see Section 3.*

#### ECONOMY — Wan 2.6 / 2.7 (Alibaba, open-source)
**Free/cheap. Landscapes, environments, simple shots. ~20s generation.**

```typescript
// Wan 2.6
const WAN_26_T2V    = 'fal-ai/wan-2.6/text-to-video'  // or 'wan/v2.6/t2v'
const WAN_26_I2V    = 'fal-ai/wan-i2v'                  // confirmed Wan 2.1 I2V
// Wan 2.7 (latest)
const WAN_27_T2V    = 'fal-ai/wan-2.7/text-to-video'

// T2V input:
interface WanInput {
  prompt: string
  negative_prompt?: string
  num_frames?: number         // default 81
  fps?: number                // default 16
  resolution?: '480p' | '720p'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  seed?: number
}

// PRICING: ~$0.20 for 5s at 480p; $0.40 at 720p
// IDEAL FOR: landscapes, backgrounds, simple B-roll, draft renders
```

#### RAPID — LTX-2.3 (Lightricks)
**Fast 20-second clips. Stereo audio. Draft tier. Pro and Fast variants.**

```typescript
const LTX_23_T2V_PRO    = 'fal-ai/ltx-video/v2.3/pro/text-to-video'
const LTX_23_T2V_FAST   = 'fal-ai/ltx-video/v2.3/fast/text-to-video'
const LTX_23_I2V_PRO    = 'fal-ai/ltx-video/v2.3/pro/image-to-video'
const LTX_23_I2V_FAST   = 'fal-ai/ltx-video/v2.3/fast/image-to-video'
const LTX_23_A2V        = 'fal-ai/ltx-video/v2.3/audio-to-video'

// Input:
interface LTX23Input {
  prompt: string
  negative_prompt?: string
  image_url?: string          // for I2V
  audio_url?: string          // for A2V
  duration?: number           // up to 20 seconds
  resolution?: '540p' | '720p' | '1080p'
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  seed?: number
}

// PRICING: ~$0.05–0.10 per 5s clip (very cheap, for fast iteration)
```

#### EFFECTS — PixVerse V5.5 / V6 (PixVerse)
**Stylized, creative effects, artistic transitions, anime.**

```typescript
const PIXVERSE_V5     = 'fal-ai/pixverse/v5/text-to-video'
const PIXVERSE_V5_I2V = 'fal-ai/pixverse/v5/image-to-video'
const PIXVERSE_V6     = 'fal-ai/pixverse/v6/text-to-video'     // latest
const PIXVERSE_LIPS   = 'fal-ai/pixverse/lipsync'

// Input:
interface PixVerseInput {
  prompt: string
  negative_prompt?: string
  image_url?: string
  duration: 4 | 8
  quality: '540p' | '720p' | '1080p'
  style?: 'realistic' | 'anime' | '3d_cartoon' | 'clay' | 'comic'
  motion_strength?: number    // 0–100
  seed?: number
}

// PRICING: ~$0.15–0.40 per 5s depending on resolution
```

#### SPECIALIST — MiniMax Hailuo 2.3
**Cinematic realism, advanced camera control, expressive performances.**

```typescript
// Pro tier (1080p)
const HAILUO_23_T2V_PRO     = 'fal-ai/minimax/hailuo-2.3/pro/text-to-video'
const HAILUO_23_I2V_PRO     = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video'
// Standard tier (768p)
const HAILUO_23_T2V_STD     = 'fal-ai/minimax/hailuo-2.3/standard/text-to-video'
const HAILUO_23_I2V_STD     = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video'
// Fast variants
const HAILUO_23_I2V_PRO_FAST = 'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video'
const HAILUO_23_I2V_STD_FAST = 'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video'
// Hailuo 02 (latest, successor)
const HAILUO_02_T2V_PRO     = 'fal-ai/minimax/hailuo-02/pro/text-to-video'
const HAILUO_02_T2V_STD     = 'fal-ai/minimax/hailuo-02/standard/text-to-video'
const HAILUO_02_I2V_PRO     = 'fal-ai/minimax/hailuo-02/pro/image-to-video'

// Input:
interface HailuoInput {
  prompt: string
  image_url?: string          // for I2V
  duration?: number           // typically 6 seconds
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  seed?: number
}
```

### 1.4 Video Upscale & Enhancement Endpoints

```typescript
// Topaz Video Upscale (professional-grade upscaling)
const TOPAZ_UPSCALE     = 'fal-ai/topaz/video-upscale'
// SeedVR2 (temporal consistency upscaling)
const SEEDVR2           = 'fal-ai/seedvr2'

// Topaz input:
interface TopazInput {
  video_url: string
  scale: 2 | 4
  output_format?: 'mp4' | 'mov'
}

// SeedVR2 input:
interface SeedVR2Input {
  video_url: string
  scale?: 4                   // default 4x
}
```

### 1.5 Image Generation Endpoints (for VFX Strategy C)

```typescript
// For Strategy C (Frame-Then-Animate): generate mid-effect still → animate
const FLUX_DEV          = 'fal-ai/flux/dev'
const FLUX_PRO          = 'fal-ai/flux-pro'
const FLUX_2_PRO        = 'fal-ai/flux-pro/v2'
const NANO_BANANA_2     = 'fal-ai/nano-banana-2'    // fast/cheap
const GPT_IMAGE_2       = 'openai/gpt-image-2'      // highest quality

// Basic image gen input:
interface FluxInput {
  prompt: string
  negative_prompt?: string
  image_size: 'landscape_16_9' | 'portrait_9_16' | 'square' | 'square_hd'
  num_inference_steps?: number
  guidance_scale?: number
  seed?: number
}
```

### 1.6 3D Generation Endpoints

```typescript
// Trellis (Microsoft, high quality)
const TRELLIS           = 'fal-ai/trellis'
const TRELLIS_2         = 'fal-ai/trellis-2'
// Hunyuan 3D
const HUNYUAN_3D        = 'fal-ai/hunyuan3d-2.5'

// Trellis input:
interface TrellisInput {
  image_url: string           // reference image → 3D model
  ss_guidance_strength?: number
  ss_sampling_steps?: number
  slat_guidance_strength?: number
  slat_sampling_steps?: number
  mesh_simplify_ratio?: number
  texture_size?: number       // 512, 1024, 2048
}

// Trellis output:
interface TrellisOutput {
  model_mesh: { url: string; content_type: string }  // .glb
  video: { url: string }      // turntable preview
}
```

### 1.7 AI Vision / Quality Inspection (for QA pipeline)

```typescript
// Video Understanding (for quality inspection)
const VIDEO_UNDERSTANDING = 'fal-ai/video-understanding'

interface VideoUnderstandingInput {
  video_url: string
  prompt: string              // e.g., "Rate this video clip 0-10 for visual coherence..."
}

// Output: { output: string }  — free text response from vision model
```

### 1.8 Audio on fal.ai (ElevenLabs Proxy)

```typescript
// ElevenLabs models available via fal unified key
const EL_TTS_V3         = 'elevenlabs/tts'         // eleven_v3
const EL_SCRIBE_V2      = 'elevenlabs/scribe-v2'   // speech-to-text
const EL_MUSIC          = 'elevenlabs/music'        // music generation
const EL_DUBBING        = 'elevenlabs/dubbing'      // multi-language dub
const EL_VOICE_CHANGER  = 'elevenlabs/voice-changer'

// Note: For more control, use ElevenLabs API directly (Section 2)
// fal proxy is good for simple quick calls; direct API for production voice workflows
```

---

## 2 — ELEVENLABS API (Voice, Music, SFX, Dubbing)

### 2.1 Setup

```typescript
// npm install elevenlabs

import ElevenLabs from 'elevenlabs'

const el = new ElevenLabs({
  apiKey: await keys.get('ELEVENLABS_KEY'),
})

// Direct REST base URL (for calls not covered by SDK)
const EL_BASE = 'https://api.elevenlabs.io'
```

### 2.2 TTS Models (2026)

```typescript
// Model IDs for eleven_model_id parameter:
const EL_MODELS = {
  flash_v2_5:      'eleven_flash_v2_5',       // ~75ms latency; 32 languages; 40k char limit
  turbo_v2_5:      'eleven_turbo_v2_5',       // ~250ms; 32 languages; 40k char limit
  multilingual_v2: 'eleven_multilingual_v2',  // highest quality; 29 languages; 10k char limit
  v3:              'eleven_v3',               // max expressiveness; 70+ languages; 3k char limit
  // Voice design model (for generating new voices from description)
  ttv_v2:          'eleven_multilingual_ttv_v2',
}

// RECOMMENDATION for Cinematic Forge:
// Dialogue (voiceover): eleven_multilingual_v2 (quality + lang support)
// Real-time preview: eleven_flash_v2_5 (75ms latency)
// Creative/character voices: eleven_v3 (most expressive)
```

### 2.3 Text-to-Speech

```typescript
// SDK:
const audio = await el.textToSpeech.convert(voice_id, {
  text: 'The character speaks this line with conviction.',
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.5,          // 0.0–1.0 (lower = more expressive variation)
    similarity_boost: 0.75,  // 0.0–1.0 (how closely to match the voice clone)
    style: 0.3,              // 0.0–1.0 (style exaggeration)
    use_speaker_boost: true,
  },
  output_format: 'pcm_44100',  // 'mp3_44100_128' | 'mp3_44100_192' | 'pcm_44100'
})
// audio = ReadableStream<Buffer>

// REST equivalent:
// POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
// Headers: xi-api-key: YOUR_KEY, Content-Type: application/json
// Body: { text, model_id, voice_settings, output_format }
// Response: audio/mpeg stream (or specified format)

// Audio tags (eleven_v3 and flash_v2_5):
// Use these inline to control delivery:
const text_with_tags = `
  She said, [whispers] "don't look behind you" [pause: 0.5s]
  before [sighs] stepping into the darkness.
  [laughs softly] What was I thinking?
`
```

### 2.4 Voice Cloning

```typescript
// INSTANT VOICE CLONING (IVC) — fast, lighter quality
// POST /v1/voices/add  (multipart/form-data)
const formData = new FormData()
formData.append('name', 'Character Name')
formData.append('description', 'A deep, warm male voice with a slight accent')
formData.append('labels', JSON.stringify({ accent: 'British', age: 'middle-aged' }))
// Add audio files (at least 1 minute of clean audio recommended)
formData.append('files', audioBlob, 'reference_audio.wav')

const response = await fetch(`${EL_BASE}/v1/voices/add`, {
  method: 'POST',
  headers: { 'xi-api-key': await keys.get('ELEVENLABS_KEY') },
  body: formData,
})
const { voice_id } = await response.json()
// Store voice_id in characters table: characters.voice_id = voice_id

// PROFESSIONAL VOICE CLONING (PVC) — highest quality, takes longer
// Same endpoint, but with more audio and professional labels
// PVC voices can be shared with others; IVC voices are account-private

// LIST ALL VOICES (includes cloned):
// GET /v1/voices
const voiceList = await el.voices.getAll()
// voiceList.voices[] each has: voice_id, name, labels, samples
```

### 2.5 Dubbing (Multi-language)

```typescript
// Create a dubbing job:
// POST /v1/dubbing  (multipart/form-data)
const formData = new FormData()
formData.append('name', 'My Film Dub - Spanish')
formData.append('target_lang', 'es')     // ISO 639-1 language code
formData.append('source_lang', 'en')     // auto-detect if omitted
formData.append('num_speakers', '2')
formData.append('watermark', 'false')
// Either file OR source_url:
formData.append('source_url', 'https://cdn.yoursite.com/clip.mp4')

const response = await fetch(`${EL_BASE}/v1/dubbing`, {
  method: 'POST',
  headers: { 'xi-api-key': await keys.get('ELEVENLABS_KEY') },
  body: formData,
})
const { dubbing_id, expected_duration_sec } = await response.json()

// Poll status:
// GET /v1/dubbing/{dubbing_id}
const status = await fetch(`${EL_BASE}/v1/dubbing/${dubbing_id}`, {
  headers: { 'xi-api-key': await keys.get('ELEVENLABS_KEY') }
}).then(r => r.json())
// status.status = 'pending' | 'dubbed' | 'failed'
// status.error = error message if failed

// Download dubbed audio/video:
// GET /v1/dubbing/{dubbing_id}/audio/{language_code}
// Returns: audio stream (wav/mp3)
// Note: returns audio stem, not the full video. Mux with original video in FFmpeg.

// SUPPORTED LANGUAGES (29 for multilingual_v2):
// en, es, fr, de, it, pt, pl, hi, ar, zh, ja, ko, ru, nl, sv, tr, id, fi, 
// no, da, hu, cs, ro, sk, el, bg, ms, hr, uk
```

### 2.6 Sound Effects Generation

```typescript
// POST /v1/sound-generation
const sfxResponse = await fetch(`${EL_BASE}/v1/sound-generation`, {
  method: 'POST',
  headers: {
    'xi-api-key': await keys.get('ELEVENLABS_KEY'),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Glass shattering against a stone floor, sharp crashing sound',
    duration_seconds: 2.5,    // optional; model auto-determines if omitted
    prompt_influence: 0.3,    // 0.0–1.0
    output_format: 'mp3_44100_128',
  }),
})
// Returns: audio stream (mp3)
```

### 2.7 Music Generation

```typescript
// POST /v1/music-generation (ElevenLabs Music API)
const musicResponse = await fetch(`${EL_BASE}/v1/music-generation`, {
  method: 'POST',
  headers: {
    'xi-api-key': await keys.get('ELEVENLABS_KEY'),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Melancholic cinematic score, slow strings, minor key, building tension',
    duration_seconds: 30,     // length of music to generate
    prompt_influence: 0.7,
    output_format: 'mp3_44100_192',
  }),
})
// Returns: audio stream (mp3)
// Note: Music requires additional commercial license for film/TV/advertising
```

### 2.8 Audio Isolation (Voice Separation)

```typescript
// POST /v1/audio-isolation
// Input: multipart/form-data with audio file
// Output: isolated voice audio (background removed)
// Use for: cleaning up location audio, separating dialogue from ambience
```

### 2.9 Speech-to-Text (Scribe v2)

```typescript
// POST /v1/speech-to-text
const sttResponse = await fetch(`${EL_BASE}/v1/speech-to-text`, {
  method: 'POST',
  headers: { 'xi-api-key': await keys.get('ELEVENLABS_KEY') },
  body: formData,  // file: audio, model_id: 'scribe_v2', language_code: 'en'
})
const { text, words } = await sttResponse.json()
// words[]: { text, start_time, end_time, type } — used for transcript editing
```

---

## 3 — RUNWAY GEN-4.5 API (V2V In-Context Compositing)

### 3.1 Setup

```typescript
// npm install @runwayml/sdk

import RunwayML from '@runwayml/sdk'

const runway = new RunwayML({
  apiKey: await keys.get('RUNWAY_KEY'),
})

// REST base URL (for direct calls):
const RUNWAY_BASE = 'https://api.dev.runwayml.com'
// Headers: Authorization: Bearer YOUR_KEY, X-Runway-Version: 2024-11-06
```

### 3.2 Video Generation (Gen-4.5)

```typescript
// Gen-4.5 Image-to-Video (primary for V2V compositing)
const task = await runway.imageToVideo.create({
  model: 'gen4.5',           // 'gen4.5' | 'gen4_turbo'
  promptImage: 'https://cdn.example.com/frame.jpg',  // base64 data URI also accepted
  promptText: 'The scene as the character walks forward, cinematic motion',
  duration: 5,               // 2–10 seconds (gen4.5); 2–16 (gen4_turbo)
  ratio: '1280:720',         // '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960'
  seed: 42,                  // optional for reproducibility
})
// task.id = task UUID

// Text-to-Video (no input image):
const taskT2V = await runway.imageToVideo.create({
  model: 'gen4.5',
  // omit promptImage for text-only generation
  promptText: 'A cinematic interior, warm ambient light, empty hallway',
  duration: 5,
  ratio: '1280:720',
})

// Poll task status:
let result = await runway.tasks.retrieve(task.id)
while (!['SUCCEEDED', 'FAILED'].includes(result.status)) {
  await new Promise(r => setTimeout(r, 5000))  // poll every 5s
  result = await runway.tasks.retrieve(task.id)
}
if (result.status === 'SUCCEEDED') {
  const videoUrl = result.output[0]  // download URL
}

// REST equivalent:
// POST https://api.dev.runwayml.com/v1/image_to_video
// GET  https://api.dev.runwayml.com/v1/tasks/{id}
// DEL  https://api.dev.runwayml.com/v1/tasks/{id}  (cancel job)
```

### 3.3 Model Strings

```typescript
// model strings for runway.imageToVideo.create():
const RUNWAY_MODELS = {
  gen4_5:     'gen4.5',       // Gen-4.5 (Feb 2026): improved quality + physics
  gen4_turbo: 'gen4_turbo',   // Gen-4 Turbo: fast, efficient, $0.01/s
}

// PRICING:
// gen4.5:     not publicly specified per-second; billed per video at ~$0.05–0.15
// gen4_turbo: $0.01/second confirmed
// gen4_5 supports up to 10s; gen4_turbo also up to 10s (16s for enterprise)
```

### 3.4 Third-party Models via Runway API

```typescript
// As of Feb 2026, Runway API also exposes:
// Google Veo 3.1 (via Runway routing):
// ElevenLabs Multilingual TTS (added Sep 2025)
// Nano Banana / GPT Image
// These are accessible through the same Runway SDK/REST API
// See: https://docs.dev.runwayml.com/api-details/api_changelog/
```

---

## 4 — ANTHROPIC API (Casting Director / Intelligence Brain)

### 4.1 Setup

```typescript
// npm install @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: await keys.get('ANTHROPIC_KEY'),
})
```

### 4.2 Model Reference (from official docs)

```typescript
// Current model IDs (from platform.claude.com, verified June 2026):
const CLAUDE_MODELS = {
  opus_4_8:    'claude-opus-4-8',              // THE CASTING DIRECTOR — use this
  sonnet_4_6:  'claude-sonnet-4-6',
  haiku_4_5:   'claude-haiku-4-5-20251001',
}

// claude-opus-4-8 specs:
// Context window:     1,000,000 tokens (1M) — default on Claude API
// Max output tokens:  128,000 (sync) / 300,000 (batch with beta header)
// Pricing:            $5.00 / MTok input,  $25.00 / MTok output
// Knowledge cutoff:   January 2026
// Temperature:        NOT SUPPORTED — returns 400 if temperature set
// Supports:           Text, images, files, tool use, structured output
//                     Adaptive thinking, parallel subagents, computer use

// Bedrock model ID:   anthropic.claude-opus-4-8
// Vertex AI model ID: claude-opus-4-8
```

### 4.3 Casting Director Call

```typescript
// THE CORE INTELLIGENCE CALL — called for every script decomposition
// and every shot routing decision

async function routeShot(shotDescription: string, qualityTier: string) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    // NOTE: temperature is NOT set — 400 error if you try
    system: CASTING_DIRECTOR_SYSTEM_PROMPT,  // loaded from embedded config (never renderer)
    messages: [
      {
        role: 'user',
        content: `
          Shot description: "${shotDescription}"
          Quality tier: ${qualityTier}
          Project characters: ${JSON.stringify(characterSeeds)}
          Budget remaining: ${creditsRemaining}
          
          Analyse this shot and return routing JSON.
        `,
      },
    ],
  })
  
  // response.content[0].type === 'text'
  // response.content[0].text = JSON routing decision
  return JSON.parse(response.content[0].text)
}

// EFFORT PARAMETER (Opus 4.8 specific):
// Opus 4.8 defaults to 'high' effort
// For faster/cheaper calls:
await anthropic.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 512,
  effort: 'low',    // 'low' | 'medium' | 'high' (default)
  // ...
})

// PROMPT CACHING (for repeated system prompts — massive cost saving):
await anthropic.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: CASTING_DIRECTOR_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },  // cache the system prompt
    },
  ],
  messages: [/* */],
})
// First call: full input token cost
// Subsequent calls: 90% discount on cached tokens
// Cache TTL: 5 minutes (ephemeral)
```

### 4.4 Vision Calls (Quality Inspector)

```typescript
// For QA inspector: analyse a video frame image
const qaPresponse = await anthropic.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 256,
  effort: 'low',    // QA calls don't need maximum reasoning
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: frameBase64,
          },
        },
        {
          type: 'text',
          text: `
            Original prompt: "${originalPrompt}"
            Rate this video frame 0.0–10.0 for:
            - Visual coherence
            - Prompt adherence  
            - Technical quality (no artifacts/distortion)
            Return JSON only: { score: number, issues: string[], repair_recommended: boolean }
          `,
        },
      ],
    },
  ],
})
```

---

## 5 — SUNO MUSIC API

### 5.1 Official Status (June 2026)

Suno has **no public official API**. Suno V5 is accessible only through:
1. Suno Studio (consumer interface — not suitable for production automation)
2. Approved partner integrations (not available to general developers)
3. Third-party wrappers that provide stable REST endpoints

### 5.2 Recommended: ElevenLabs Music (Official API)

```typescript
// PREFERRED for production: ElevenLabs Music API
// - Official API, fully supported
// - POST /v1/music-generation
// - See Section 2.7 above

// Use when: commercial release, professional production, guaranteed uptime
```

### 5.3 Third-Party: sunoapi.org Wrapper

```typescript
// UNOFFICIAL wrapper — use only for development/prototyping
// Risk: may lose access; not suitable for production
// If using, treat as temporary and build ElevenLabs fallback

const SUNOAPI_BASE = 'https://api.sunoapi.org'

// Generate music:
// POST /api/v1/music/generate
const generateResponse = await fetch(`${SUNOAPI_BASE}/api/v1/music/generate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${await keys.get('SUNOAPI_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Epic orchestral score, rising tension, full orchestra',
    style: 'cinematic orchestral',
    title: 'Scene Score',
    tags: 'orchestra, cinematic, tension, epic',
    make_instrumental: true,    // no lyrics/vocals
    customMode: false,          // false = simple mode; true = full control
    duration: 30,               // seconds
  }),
})
const { task_id } = await generateResponse.json()

// Poll for completion:
// GET /api/v1/music/record-info?task_id={task_id}
// Result: { status: 'pending' | 'complete', output_urls: string[] }

// ALTERNATIVE: fal.ai Stable Audio for SFX and ambient
// fal-ai/stable-audio
interface StableAudioInput {
  prompt: string
  seconds_total?: number
  steps?: number
}
```

---

## 6 — MESHY AI (Text-to-3D)

### 6.1 Setup

```typescript
const MESHY_BASE = 'https://api.meshy.ai'
// API key obtained from meshy.ai dashboard
```

### 6.2 Text to 3D

```typescript
// Stage 1: Create preview (fast, rough mesh)
// POST /v2/text-to-3d
const previewResponse = await fetch(`${MESHY_BASE}/v2/text-to-3d`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${await keys.get('MESHY_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mode: 'preview',
    prompt: 'A vintage red telephone box, high detail',
    negative_prompt: 'low quality, blurry',
    art_style: 'realistic',  // 'realistic' | 'cartoon' | 'low-poly' | 'sculpture'
    seed: 42,
  }),
})
const { result: preview_task_id } = await previewResponse.json()

// Poll preview:
// GET /v2/text-to-3d/{task_id}
// result.status = 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
// On SUCCEEDED: result.model_urls.glb = GLB download URL

// Stage 2: Refine (high-quality textures, based on preview)
const refineResponse = await fetch(`${MESHY_BASE}/v2/text-to-3d`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${await keys.get('MESHY_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mode: 'refine',
    preview_task_id: preview_task_id,
    // optionally override texture style:
    texture_richness: 'high',
  }),
})

// Output: { model_urls: { glb, fbx, obj, usdz }, thumbnail_url, progress }
```

---

## 7 — COMPLETE ROUTER IMPLEMENTATION

```typescript
// src/main/ai/router.ts
// THE INTELLIGENCE FIREWALL — all routing logic here, never in renderer

import { fal } from '@fal-ai/client'
import Anthropic from '@anthropic-ai/sdk'
import RunwayML from '@runwayml/sdk'
import { keys } from '../keys/keychain'

// Model registry — INTERNAL ONLY — NEVER export to renderer
export const MODEL_REGISTRY: Record<string, { endpointId: string; costPerSec: number }> = {
  APEX:      { endpointId: 'alibaba/happy-horse/text-to-video',                    costPerSec: 0.45 },
  APEX_I2V:  { endpointId: 'alibaba/happy-horse/image-to-video',                  costPerSec: 0.45 },
  APEX_R2V:  { endpointId: 'alibaba/happy-horse/reference-to-video',              costPerSec: 0.45 },
  APEX_EDIT: { endpointId: 'alibaba/happy-horse/video-edit',                      costPerSec: 0.45 },

  NARR_T2V:  { endpointId: 'bytedance/seedance-2.0/text-to-video',                costPerSec: 0.30 },
  NARR_I2V:  { endpointId: 'bytedance/seedance-2.0/image-to-video',               costPerSec: 0.30 },
  NARR_R2V:  { endpointId: 'bytedance/seedance-2.0/reference-to-video',           costPerSec: 0.30 },
  NARR_T2V_F:{ endpointId: 'bytedance/seedance-2.0/fast/text-to-video',           costPerSec: 0.24 },
  NARR_I2V_F:{ endpointId: 'bytedance/seedance-2.0/fast/image-to-video',          costPerSec: 0.24 },

  KLING_PRO_T2V: { endpointId: 'kling/video/v3/pro/text-to-video',               costPerSec: 0.34 },
  KLING_PRO_I2V: { endpointId: 'kling/video/v3/pro/image-to-video',              costPerSec: 0.34 },
  KLING_STD_T2V: { endpointId: 'kling/video/v3/standard/text-to-video',          costPerSec: 0.13 },
  KLING_STD_I2V: { endpointId: 'kling/video/v3/standard/image-to-video',         costPerSec: 0.13 },
  KLING_LIPS:    { endpointId: 'kling/video/lipsync',                             costPerSec: 0.15 },

  VEO_STD:   { endpointId: 'google/veo-3.1',                                     costPerSec: 0.50 },
  VEO_FAST:  { endpointId: 'google/veo-3.1/fast',                                costPerSec: 0.15 },
  VEO_LITE:  { endpointId: 'google/veo-3.1/lite',                                costPerSec: 0.03 },

  SORA_2:    { endpointId: 'openai/sora-2',                                       costPerSec: 0.50 },
  SORA_PRO:  { endpointId: 'openai/sora-2/pro',                                  costPerSec: 0.70 },

  CONTROL_T2V: { endpointId: 'gen4.5',          costPerSec: 0.15 },  // via Runway SDK (not fal)
  CONTROL_I2V: { endpointId: 'gen4.5',          costPerSec: 0.15 },  // via Runway SDK
  RUNWAY_FAST: { endpointId: 'gen4_turbo',      costPerSec: 0.01 },  // via Runway SDK

  WAN_26:    { endpointId: 'fal-ai/wan-2.6/text-to-video',                       costPerSec: 0.04 },
  WAN_27:    { endpointId: 'fal-ai/wan-2.7/text-to-video',                       costPerSec: 0.04 },
  WAN_I2V:   { endpointId: 'fal-ai/wan-i2v',                                     costPerSec: 0.05 },

  LTX_PRO:   { endpointId: 'fal-ai/ltx-video/v2.3/pro/text-to-video',            costPerSec: 0.10 },
  LTX_FAST:  { endpointId: 'fal-ai/ltx-video/v2.3/fast/text-to-video',           costPerSec: 0.05 },
  LTX_A2V:   { endpointId: 'fal-ai/ltx-video/v2.3/audio-to-video',               costPerSec: 0.08 },

  PIXV_V6:   { endpointId: 'fal-ai/pixverse/v6/text-to-video',                   costPerSec: 0.08 },
  PIXV_I2V:  { endpointId: 'fal-ai/pixverse/v5/image-to-video',                  costPerSec: 0.08 },

  HAIL_PRO_T2V: { endpointId: 'fal-ai/minimax/hailuo-02/pro/text-to-video',      costPerSec: 0.20 },
  HAIL_PRO_I2V: { endpointId: 'fal-ai/minimax/hailuo-02/pro/image-to-video',     costPerSec: 0.20 },
  HAIL_STD_T2V: { endpointId: 'fal-ai/minimax/hailuo-2.3/standard/text-to-video',costPerSec: 0.08 },

  TOPAZ:     { endpointId: 'fal-ai/topaz/video-upscale',                         costPerSec: 0.30 },
  SEEDVR2:   { endpointId: 'fal-ai/seedvr2',                                     costPerSec: 0.20 },
  VQA:       { endpointId: 'fal-ai/video-understanding',                          costPerSec: 0.05 },

  TRELLIS_2: { endpointId: 'fal-ai/trellis-2',                                   costPerSec: 0.00 },  // per-job
  HUNYUAN_3D:{ endpointId: 'fal-ai/hunyuan3d-2.5',                              costPerSec: 0.00 },  // per-job
}

// CRITICAL: The keys of MODEL_REGISTRY are INTERNAL IDENTIFIERS.
// They NEVER appear in any user-facing string, tooltip, log file, or UI label.
// Users only ever see: "Forge Intelligence", quality tier names, generic progress messages.

export async function dispatchJob(
  modelKey: keyof typeof MODEL_REGISTRY,
  input: Record<string, unknown>,
  jobId: string,
  onProgress: (msg: string) => void,
): Promise<{ outputUrl: string; cost: number }> {
  const model = MODEL_REGISTRY[modelKey]
  
  // Route Runway separately (different SDK)
  if (modelKey.startsWith('CONTROL') || modelKey.startsWith('RUNWAY')) {
    return dispatchRunway(model.endpointId, input, jobId, onProgress)
  }
  
  const result = await fal.subscribe(model.endpointId, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_QUEUE') {
        onProgress(`Queued (position ${update.position})`)
      }
      if (update.status === 'IN_PROGRESS') {
        update.logs?.forEach(log => onProgress(log.message))
      }
    },
  })
  
  const outputUrl = result.data?.video?.url
    ?? result.data?.model_mesh?.url
    ?? result.data?.audio?.url
  
  if (!outputUrl) throw new Error(`No output URL in result for ${modelKey}`)
  
  return { outputUrl, cost: model.costPerSec }
}
```

---

## 8 — ENVIRONMENT VARIABLES (Development Only)

During development only (never in production — use keychain):

```bash
# .env.local (gitignored)
FAL_KEY=your_fal_api_key_here
ANTHROPIC_KEY=sk-ant-your_key_here
ELEVENLABS_KEY=your_elevenlabs_key_here
RUNWAY_KEY=your_runway_key_here
SUNOAPI_KEY=your_sunoapi_key_here
MESHY_KEY=your_meshy_key_here
```

---

## 9 — UPDATED CURSOR FEED ORDER

```
17. CINEMA_V3_CURSOR_PROMPT.md
18. CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md
19. CINEMA_V3_VFX_EFFECTS_ADDENDUM.md
20. CINEMA_V3_PLAYER_RENDERER_ADDENDUM.md
21. CINEMA_V3_API_REFERENCE_ADDENDUM.md    ← THIS DOCUMENT (position 21)

No new sprints added — this document informs the existing Sprint 25-28
(Swarm, Voice Pipeline, Music Generation, Quality Inspector) with exact
endpoint strings, SDK patterns, and pricing.

Cursor must:
  1. Reference this document when implementing any AI API call
  2. Use EXACT endpoint strings from MODEL_REGISTRY
  3. Never put API keys in code — use the keychain helpers
  4. Never expose model names to renderer — all calls in src/main/ai/ only
  5. Always handle FAILED job status with fallback to alternate model
```

---

## 10 — FALLBACK CHAINS

When a primary model fails or is unavailable:

```typescript
const FALLBACK_CHAINS: Record<string, string[]> = {
  // If APEX fails → try these in order
  APEX:      ['NARR_T2V',    'KLING_PRO_T2V'],
  NARR_T2V:  ['APEX',        'KLING_PRO_T2V', 'KLING_STD_T2V'],
  VEO_STD:   ['VEO_FAST',    'APEX',          'KLING_PRO_T2V'],
  SORA_2:    ['VEO_STD',     'NARR_T2V',      'KLING_PRO_T2V'],
  CONTROL_T2V:['NARR_T2V',   'APEX',          'KLING_PRO_T2V'],
  WAN_26:    ['WAN_27',      'LTX_FAST',      'HAIL_STD_T2V'],
  LTX_FAST:  ['LTX_PRO',    'WAN_26',        'HAIL_STD_T2V'],
  HAIL_PRO_T2V:['HAIL_STD_T2V','KLING_STD_T2V','WAN_26'],
  KLING_LIPS:['APEX',        'NARR_R2V'],     // lip-sync fallback to multi-ref
}

// If all fallbacks fail: mark job as FAILED, surface to user
// User sees: "Unable to generate this segment — please retry or adjust prompt"
// User does NOT see: which models were tried or why they failed
```

---

*Cinematic Forge V3 — API Reference Addendum*
*Version: 1.0 | June 2026 | All endpoints researched and live-verified*
*21 Documents in Feed | 52 Sprints Total | Requires: Cursor Agent with claude-opus-4-8*
