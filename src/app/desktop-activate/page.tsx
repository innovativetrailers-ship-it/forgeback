'use client'

import { useState } from 'react'

export default function DesktopActivatePage() {
  const [deviceId, setDeviceId] = useState('')
  const [message, setMessage] = useState('')

  async function activate() {
    const res = await fetch('/api/entitlement/activate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId.trim(), deviceName: 'desktop' }),
    })
    const body = await res.json() as { entitled?: boolean; reason?: string; error?: string; token?: string }
    if (!res.ok || !body.entitled) {
      setMessage(body.reason || body.error || 'Desktop is locked for this account.')
      return
    }
    setMessage('This desktop is activated. Return to the app.')
  }

  async function trial() {
    const res = await fetch('/api/entitlement/trial', { method: 'POST', credentials: 'include' })
    const body = await res.json() as { error?: string }
    setMessage(res.ok ? 'Trial started. Activate this desktop next.' : (body.error || 'Trial was refused.'))
  }

  return (
    <main className="mx-auto max-w-lg space-y-3 p-6 text-sm text-white/80">
      <h1 className="text-lg text-white">Desktop access</h1>
      <p>Desktop opens for an active Ultimate plan, a desktop subscription, or the one-time 30-day trial. Hosted generation is still billed. Your projects stay on the server.</p>
      <input className="w-full rounded bg-black/40 px-2 py-1" placeholder="Device id from the desktop app" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
      <div className="flex gap-2">
        <button type="button" className="rounded bg-white/10 px-3 py-1" onClick={() => void activate()}>Activate</button>
        <button type="button" className="rounded bg-white/10 px-3 py-1" onClick={() => void trial()}>Start 30-day trial</button>
        <a className="rounded bg-white/10 px-3 py-1" href="/api/credits/purchase">Manage account</a>
      </div>
      {message && <p>{message}</p>}
    </main>
  )
}
