import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import assert from 'node:assert/strict'

const port = 3099
const base = `http://127.0.0.1:${port}`

async function json(path, options = {}) {
  const res = await fetch(base + path, {
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null }
}

test('launch smoke', async (t) => {
  const child = spawn(process.execPath, ['e2e/launch-server.mjs'], {
    env: { ...process.env, LAUNCH_SMOKE_PORT: String(port) },
    stdio: 'ignore',
  })
  t.after(() => child.kill())
  await once(child, 'spawn')
  for (let i = 0; i < 20; i++) {
    try {
      const health = await fetch(base + '/health')
      if (health.ok) break
    } catch { /* server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const signedOut = await json('/app')
  assert.equal(signedOut.status, 302)
  assert.match(signedOut.headers.get('location') || '', /\/login/)

  const login = await json('/api/auth/test-login', { method: 'POST', body: {} })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie') || ''
  const signedIn = await json('/app', { headers: { cookie } })
  assert.equal(signedIn.status, 200)

  const generated = await json('/api/generate', { method: 'POST', body: { prompt: 'a street', credits: 8 } })
  assert.match(generated.body.clip.storageKey, /^clips\//)
  assert.equal(generated.body.clip.videoUrl.includes('fal.media'), false)

  const directed = await json('/api/director', { method: 'POST', body: { mode: 'manual', script: 'INT. ROOM' } })
  assert.equal(directed.body.mode, 'manual')
  assert.ok(directed.body.shot.storageKey)

  const imported = await json('/api/import', { method: 'POST', body: { name: 'clip.mp4' } })
  const exported = await json('/api/export', { method: 'POST', body: { ...imported.body, lut: 'kodak' } })
  assert.equal(exported.body.playable, true)
  assert.equal(exported.body.preview, exported.body.export)

  const blocked = await json('/api/generate', { method: 'POST', body: { credits: 0, internal: false } })
  assert.equal(blocked.status, 402)
  const internal = await json('/api/generate', { method: 'POST', body: { credits: 0, internal: true } })
  assert.equal(internal.body.hold, 0)
  assert.equal(internal.body.metered, false)
})
