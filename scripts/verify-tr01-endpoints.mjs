/**
 * TR-01: free OpenAPI existence probe. No FAL generate.
 */
const CANDIDATES = [
  // H3 trainers + inference
  'minimax/h3/t2v/trainer',
  'minimax/h3/ref2va/trainer',
  'minimax/h3/i2v/trainer',
  'minimax/h3/image-to-video/trainer',
  'minimax/h3/flf2v/trainer',
  'minimax/h3/first-last-frame-to-video/trainer',
  'minimax/h3/text-to-video/lora',
  'minimax/h3/image-to-video/lora',
  'minimax/h3/reference-to-video/lora',
  'fal-ai/minimax/h3/t2v/trainer',
  'fal-ai/minimax/h3/text-to-video/lora',
  // Wan
  'fal-ai/wan-trainer',
  'fal-ai/wan-22-image-trainer',
  'fal-ai/wan/v2.2/image-trainer',
  'fal-ai/wan/v2.1/image-to-video/lora',
  'fal-ai/wan/v2.2/image-to-video/lora',
  'fal-ai/wan/v2.2/text-to-video/lora',
  'fal-ai/wan-i2v-lora',
  'fal-ai/wan/image-to-video-lora',
  'fal-ai/wan/v2.1/i2v-lora',
  'fal-ai/wan-animate',
  'fal-ai/wan-animate-2',
  'fal-ai/wan/v2.2/animate',
  'fal-ai/wan-22-animate',
  'fal-ai/wan/v2.2/animate-move',
  // LTX
  'fal-ai/ltx-2-video-trainer',
  'fal-ai/ltx-video-trainer',
  'fal-ai/ltx-2/trainer',
  'fal-ai/ltx-2.3/trainer',
  'fal-ai/ltx-2.3-trainer',
  'fal-ai/ltx-2.3/video-trainer',
  'fal-ai/ltx-2-19b-trainer',
  'fal-ai/ltx-2.3/image-to-video/trainer',
  'fal-ai/ltx-2.3/i2v-trainer',
  'ltx-2-19b/audio-to-video/lora',
  'fal-ai/ltx-2-19b/audio-to-video/lora',
  'ltx-2-19b/distilled/audio-to-video/lora',
  'ltx-2-19b/distilled/video-to-video/lora',
  'fal-ai/ltx-2-19b/distilled/audio-to-video/lora',
  'fal-ai/ltx-2-19b/distilled/video-to-video/lora',
  'fal-ai/ltx-2.3/text-to-video/lora',
  'fal-ai/ltx-2.3/image-to-video/lora',
  'fal-ai/ltx-2.3/audio-to-video/lora',
  // FLUX trainers + inference
  'fal-ai/flux-lora-portrait-trainer',
  'fal-ai/flux-lora-fast-trainer',
  'fal-ai/flux-lora-fast-training',
  'fal-ai/flux-lora-trainer',
  'fal-ai/flux-2-trainer',
  'fal-ai/flux-2/dev/trainer',
  'fal-ai/flux-2/trainer',
  'fal-ai/flux-2-lora-trainer',
  'fal-ai/flux-2/klein/trainer',
  'fal-ai/flux-2/klein/9b/trainer',
  'fal-ai/flux-2/klein/9b/base/trainer',
  'fal-ai/flux-2/klein/9b/base/edit/lora',
  'flux-2/klein/9b/base/edit/lora',
  'fal-ai/flux-kontext-lora',
  'fal-ai/flux-pro/kontext/lora',
  'fal-ai/flux-kontext/dev/lora',
  'fal-ai/flux/dev/lora',
  'fal-ai/flux-lora',
  'fal-ai/flux-2-lora-gallery',
  'fal-ai/flux-lora-gallery',
  'fal-ai/flux-lora-inpaint',
  'fal-ai/flux-lora-inpainting',
  'fal-ai/flux/inpaint/lora',
  'fal-ai/flux-2/inpaint/lora',
  'fal-ai/flux-2/klein/9b/base/inpaint/lora',
  'fal-ai/flux-satellite',
  'fal-ai/flux-geo',
  'fal-ai/flux-2/geo',
  'fal-ai/ideogram/v4/lora/training',
  'fal-ai/ideogram/character-trainer',
  'fal-ai/recraft-v3/create-style',
  'fal-ai/z-image',
  'fal-ai/z-image/lora',
  'fal-ai/z-image-lora',
  'fal-ai/z-image/base',
  // Audio
  'fal-ai/stable-audio-3-trainer',
  'fal-ai/stable-audio-3/lora',
  'fal-ai/stable-audio-3',
  'fal-ai/stable-audio-3/text-to-audio/lora',
  'fal-ai/elevenlabs/tts/multilingual-v2',
  'fal-ai/elevenlabs/tts/turbo-v2.5',
  'fal-ai/elevenlabs/tts/multilingual-v2.0',
  'fal-ai/elevenlabs/music',
  'fal-ai/elevenlabs/forced-alignment',
  'fal-ai/elevenlabs/voice-clone',
  'fal-ai/elevenlabs/voice-design',
  'fal-ai/elevenlabs/sound-effects',
  'fal-ai/minimax/voice-clone',
  'fal-ai/minimax/voice-clone/create',
  // SAM
  'fal-ai/sam-3/image-rle',
  'fal-ai/sam-3',
  'fal-ai/sam-3d',
  'fal-ai/sam-3d/objects',
  'fal-ai/sam-3d/body',
  'fal-ai/sam3d',
]

function inputSchemaOf(doc) {
  const paths = doc.paths ?? {}
  const components = doc.components
  for (const methods of Object.values(paths)) {
    for (const op of Object.values(methods)) {
      const schema = op.requestBody?.content?.['application/json']?.schema
      if (schema?.$ref && components?.schemas) {
        const name = schema.$ref.split('/').pop()
        const resolved = name ? components.schemas[name] : undefined
        if (resolved?.properties) return resolved
      }
      if (schema?.properties) return schema
    }
  }
  return { properties: {}, required: [] }
}

async function probe(id) {
  const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(id)}`
  try {
    const res = await fetch(url)
    if (res.status !== 200) return { id, code: res.status }
    const doc = await res.json()
    const input = inputSchemaOf(doc)
    const props = Object.keys(input.properties ?? {})
    const loraish = props.filter((p) => /lora|trigger|training|data_url|images_data|audio_data|rank|steps/i.test(p))
    return { id, code: 200, required: input.required ?? [], properties: props, loraish }
  } catch (err) {
    return { id, code: 'ERR', error: err instanceof Error ? err.message : String(err) }
  }
}

const rows = []
for (let i = 0; i < CANDIDATES.length; i += 8) {
  const batch = CANDIDATES.slice(i, i + 8)
  rows.push(...await Promise.all(batch.map(probe)))
}

const ok = rows.filter((r) => r.code === 200)
const dead = rows.filter((r) => r.code !== 200)
console.log('OK', ok.length)
for (const r of ok) {
  console.log(JSON.stringify({
    id: r.id,
    required: r.required,
    loraish: r.loraish,
    properties: r.properties,
  }))
}
console.log('DEAD', dead.length)
for (const r of dead) console.log(r.code, r.id)
