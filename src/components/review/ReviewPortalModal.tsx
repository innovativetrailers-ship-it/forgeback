'use client'

import { useEffect, useState } from 'react'
import { Copy, Link2, X } from 'lucide-react'
import { useUIStore } from '@/store/ui'

interface ReviewLinkRow {
  id: string
  token: string
  title: string
  status: string
  expiresAt: string | null
  createdAt: string
}

interface ReviewPortalModalProps {
  projectId: string
  projectTitle?: string
}

export function ReviewPortalModal({ projectId, projectTitle }: ReviewPortalModalProps) {
  const { activeModal, closeModal } = useUIStore()
  const open = activeModal === 'reviewPortal'

  const [title, setTitle] = useState(projectTitle ?? 'Client review')
  const [expiry, setExpiry] = useState<'24h' | '7d' | '30d' | 'never'>('7d')
  const [pin, setPin] = useState('')
  const [watermarkName, setWatermarkName] = useState('')
  const [allowDownload, setAllowDownload] = useState(false)
  const [links, setLinks] = useState<ReviewLinkRow[]>([])
  const [creating, setCreating] = useState(false)
  const [lastUrl, setLastUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !projectId) return
    void fetch(`/api/review/create?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((data: { links?: ReviewLinkRow[] }) => setLinks(data.links ?? []))
      .catch((err) => {
        console.warn("[caught] src/components/review/ReviewPortalModal.tsx:37", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (setLinks([]))
      })
  }, [open, projectId])

  async function createLink() {
    setCreating(true)
    try {
      const res = await fetch('/api/review/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, title, expiry, pin, watermarkName, allowDownload }),
      })
      const data = (await res.json()) as { reviewUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create link')
      setLastUrl(data.reviewUrl ?? null)
      const list = await fetch(`/api/review/create?projectId=${encodeURIComponent(projectId)}`).then(
        (r) => r.json(),
      )
      setLinks((list as { links?: ReviewLinkRow[] }).links ?? [])
    } catch (err) {
      console.warn("[caught] src/components/review/ReviewPortalModal.tsx:55", err instanceof Error ? { name: err.name, message: err.message } : err)

      alert((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#12121a] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link2 size={16} className="text-[#00e5c8]" />
            Client review portal
          </div>
          <button type="button" onClick={closeModal} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Review title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Client name on the watermark</label>
            <input
              value={watermarkName}
              onChange={(e) => setWatermarkName(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none"
              autoComplete="off"
            />
          </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Expires</label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as '24h' | '7d' | '30d' | 'never')}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="never">Never</option>
              </select>
            </div>
            <label className="flex items-end gap-2 text-sm pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowDownload}
                onChange={(e) => setAllowDownload(e.target.checked)}
              />
              Allow download
            </label>

          <button
            type="button"
            disabled={creating}
            onClick={() => void createLink()}
            className="w-full py-2 rounded-lg bg-[#00e5c8] text-black font-medium text-sm disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create review link'}
          </button>

          {lastUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className="truncate flex-1 text-[#00e5c8]">{lastUrl}</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(lastUrl)}
                className="text-gray-400 hover:text-white"
                title="Copy link"
              >
                <Copy size={14} />
              </button>
            </div>
          )}

          {links.length > 0 && (
            <div className="border-t border-white/10 pt-3 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Existing links</p>
              {links.map((link) => {
                const url = `${window.location.origin}/review/${link.token}`
                return (
                  <div key={link.id} className="flex items-center gap-2 text-xs bg-white/5 rounded px-2 py-1.5">
                    <span className="flex-1 truncate">{link.title}</span>
                    <span className="text-gray-500 capitalize">{link.status}</span>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(url)}
                      className="text-[#00e5c8] hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
