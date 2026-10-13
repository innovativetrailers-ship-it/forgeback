import { probeEndpointExistence } from '../src/lib/fal/registryProbe'

async function main() {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY
  if (!key) { console.error('no key'); process.exit(1) }
  const ids = [
    'bria/video/background-removal/v3',
    'bria/video/background-removal',
    'fal-ai/birefnet/v2/video',
    'fal-ai/wan-vace-14b/inpainting',
    'fal-ai/void-video-inpainting',
    'fal-ai/bria/video/eraser',
  ]
  for (const id of ids) {
    const r = await probeEndpointExistence(id, key)
    console.log(id, '→', r.alive ? 'ALIVE' : 'DEAD', JSON.stringify(r.detail).slice(0, 120))
  }
}
void main()
