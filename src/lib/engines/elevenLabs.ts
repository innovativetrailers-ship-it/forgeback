const BASE    = 'https://api.elevenlabs.io/v1'
const API_KEY = () => process.env.ELEVENLABS_API_KEY!

export async function synthesiseVoice(params: {
  text:          string
  voiceId?:      string
  modelId?:      string
  stability?:    number
  similarity?:   number
  style?:        number
  speakerBoost?: boolean
}): Promise<Buffer> {
  const voiceId = params.voiceId ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID!
  const modelId = params.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2'

  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method:  'POST',
    headers: { 'xi-api-key': API_KEY(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: params.text,
      model_id: modelId,
      voice_settings: {
        stability:         params.stability   ?? 0.5,
        similarity_boost:  params.similarity  ?? 0.75,
        style:             params.style       ?? 0,
        use_speaker_boost: params.speakerBoost ?? true,
      },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function cloneVoice(params: {
  name:        string
  description: string
  audioUrls:   string[]
}): Promise<{ voiceId: string }> {
  const formData = new FormData()
  formData.append('name',        params.name)
  formData.append('description', params.description)
  for (const url of params.audioUrls) {
    const buf = await fetch(url).then(r => r.arrayBuffer())
    formData.append('files', new Blob([buf], { type: 'audio/mpeg' }), `sample_${Date.now()}.mp3`)
  }
  const res  = await fetch(`${BASE}/voices/add`, { method: 'POST', headers: { 'xi-api-key': API_KEY() }, body: formData })
  const data = await res.json() as { voice_id: string }
  return { voiceId: data.voice_id }
}

export async function speechToSpeech(params: {
  audioBuffer: Buffer
  voiceId:     string
  modelId?:    string
}): Promise<Buffer> {
  const formData = new FormData()
  formData.append('audio',    new Blob([params.audioBuffer], { type: 'audio/mpeg' }), 'input.mp3')
  formData.append('model_id', params.modelId ?? 'eleven_multilingual_sts_v2')
  const res = await fetch(`${BASE}/speech-to-speech/${params.voiceId}`, {
    method: 'POST', headers: { 'xi-api-key': API_KEY() }, body: formData,
  })
  return Buffer.from(await res.arrayBuffer())
}

export async function generateSFX(params: {
  text: string; durationSeconds: number
}): Promise<Buffer> {
  const res = await fetch(`${BASE}/sound-generation`, {
    method:  'POST',
    headers: { 'xi-api-key': API_KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: params.text, duration_seconds: params.durationSeconds, prompt_influence: 0.3 }),
  })
  return Buffer.from(await res.arrayBuffer())
}

export async function listVoices(): Promise<unknown[]> {
  const res  = await fetch(`${BASE}/voices`, { headers: { 'xi-api-key': API_KEY() } })
  const data = await res.json() as { voices: unknown[] }
  return data.voices ?? []
}
