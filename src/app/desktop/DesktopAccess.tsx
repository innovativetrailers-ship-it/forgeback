'use client'

import { useState } from 'react'

interface Props {
  signedIn: boolean
  email: string | null
  internal: boolean
  initialCode?: string
  deviceName?: string | null
}

export function DesktopAccess({ signedIn, email, internal, initialCode = '', deviceName = null }: Props) {
  const [code, setCode] = useState(initialCode)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function approve() {
    setBusy(true)
    try {
      const res = await fetch('/api/desktop/link/approve', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await res.json() as { approved?: boolean; error?: string; deviceName?: string | null; email?: string | null }
      if (!res.ok || !body.approved) {
        setMessage(body.error || 'This computer was not linked.')
        return
      }
      setMessage(`Linked${body.deviceName ? ` ${body.deviceName}` : ''} to ${body.email || email || 'this account'}. Return to the desktop app.`)
    } finally {
      setBusy(false)
    }
  }

  async function trial() {
    const res = await fetch('/api/entitlement/trial', { method: 'POST', credentials: 'include' })
    const body = await res.json() as { error?: string }
    setMessage(res.ok ? 'Trial started. Approve this computer next.' : (body.error || 'Trial was refused.'))
  }

  return (
    <main className="mx-auto max-w-lg space-y-3 p-6 text-sm text-white/80">
      <h1 className="text-lg text-white">Desktop access</h1>
      {internal ? (
        <p>Internal account — desktop enabled</p>
      ) : (
        <p>Desktop needs an active Ultimate plan, a desktop subscription, or a desktop trial. Hosted generation is still billed. Your projects stay on this computer.</p>
      )}
      {deviceName && code && (
        <p>Link this computer ({deviceName}) to {email || 'your account'}?</p>
      )}
      {!signedIn && <p>Sign in to approve a computer.</p>}
      <label className="block text-[11px] text-white/50" htmlFor="desktop-code">Paste code</label>
      <input
        id="desktop-code"
        className="w-full rounded bg-black/40 px-2 py-1"
        placeholder="Code from the desktop app"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded bg-white/10 px-3 py-1" disabled={busy || !code.trim()} onClick={() => void approve()}>
          {deviceName ? 'Approve' : 'Activate'}
        </button>
        {!internal && (
          <button type="button" className="rounded bg-white/10 px-3 py-1" onClick={() => void trial()}>Start 30-day trial</button>
        )}
        <a className="rounded bg-white/10 px-3 py-1" href="/api/credits/purchase">Manage account</a>
      </div>
      {message && <p>{message}</p>}
    </main>
  )
}
