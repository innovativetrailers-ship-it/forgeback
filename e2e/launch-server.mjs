import { createServer } from 'node:http'

const port = Number(process.env.LAUNCH_SMOKE_PORT || 3099)

function send(res, status, body, headers = {}) {
  const raw = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), ...headers })
  res.end(raw)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/health') {
    send(res, 200, { ok: true })
    return
  }
  const signedIn = (req.headers.cookie || '').includes('forge_test=1')
  if (url.pathname === '/app') {
    if (!signedIn) {
      res.writeHead(302, { location: '/login' })
      res.end()
      return
    }
    send(res, 200, { ok: true })
    return
  }
  if (url.pathname === '/api/auth/test-login' && req.method === 'POST') {
    send(res, 200, { ok: true }, { 'set-cookie': 'forge_test=1; Path=/' })
    return
  }
  if (req.method !== 'POST') {
    send(res, 404, { error: 'not found' })
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
  if (url.pathname === '/api/generate') {
    if (!body.internal && (body.credits ?? 8) <= 0) {
      send(res, 402, { error: 'Insufficient credits' })
      return
    }
    send(res, 200, {
      metered: !body.internal,
      hold: body.internal ? 0 : 8,
      clip: { id: 'clip-1', storageKey: 'clips/test/clip-1.mp4', videoUrl: 'https://media.example/clips/test/clip-1.mp4' },
    })
    return
  }
  if (url.pathname === '/api/director') {
    send(res, 200, {
      mode: body.mode,
      shot: { id: 'shot-1', storageKey: 'clips/test/shot-1.mp4' },
    })
    return
  }
  if (url.pathname === '/api/import') {
    send(res, 200, { id: 'import-1', sourceUrl: 'https://media.example/imports/clip.mp4', lut: null })
    return
  }
  if (url.pathname === '/api/export') {
    send(res, 200, { playable: true, preview: body.lut || 'none', export: body.lut || 'none' })
    return
  }
  send(res, 404, { error: 'not found' })
})

server.listen(port, () => {
  console.log(`launch-smoke http://127.0.0.1:${port}`)
})
