import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { fal } = await import('@fal-ai/client')
fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY })
const ep = 'fal-ai/wan/v2.2-5b/text-to-video'
const id = '019e838d-6b4f-7671-9d92-c70cb3858f67'
const t0 = Date.now()
let last = ''
for (let i = 0; i < 180; i++) {
  let s
  try { s = await fal.queue.status(ep, { requestId: id, logs: false }) }
  catch (e) { console.log('STATUS_ERR', e?.status, JSON.stringify(e?.body ?? e?.message).slice(0,200)); break }
  if (s.status !== last) { last = s.status; console.log(`[${((Date.now()-t0)/1000)|0}s] ${s.status}`) }
  if (s.status === 'COMPLETED') {
    const r = await fal.queue.result(ep, { requestId: id })
    const url = r?.data?.video?.url ?? r?.video?.url
    console.log('RESULT_URL', url)
    console.log(url ? 'SMOKE_PASS' : 'SMOKE_NOURL')
    break
  }
  if (s.status === 'FAILED') { console.log('SMOKE_FAILED'); break }
  await new Promise((r) => setTimeout(r, 5000))
}
process.exit(0)
