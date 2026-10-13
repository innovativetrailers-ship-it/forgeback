'use client'

import { useEffect, useState } from 'react'
import { X, Zap, Monitor } from 'lucide-react'

const PLAN_DETAILS: Record<string, {
  label: string; price: string; credits: string; highlights: string[]
}> = {
  pro: {
    label:      'Simple',
    price:      '$19/mo',
    credits:    '500 credits/month — or pay-as-you-go',
    highlights: [
      'No subscription required for credits',
      'Standard + Cinematic quality',
      'Advanced mode',
      '2 Director models',
    ],
  },
  studio: {
    label:      'Advanced',
    price:      '$49/mo',
    credits:    '2,000 credits/month',
    highlights: [
      'Active subscription required',
      'Film quality + Director mode',
      '7 Director models',
      'Voice cloning & 4K export',
    ],
  },
  ultimate: {
    label:      'Ultimate',
    price:      '$99/mo',
    credits:    '6,000 credits/month',
    highlights: [
      'Forge Extreme desktop included',
      '21 Director models',
      'ForgeFlow + ForgeReview',
      'DCP + IMF export',
    ],
  },
}

export function UpgradeModal() {
  const [open,     setOpen]     = useState(false)
  const [required, setRequired] = useState<string>('pro')
  const [message,  setMessage]  = useState<string | null>(null)
  const [feature,  setFeature]  = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requiredTier?: string
        message?:      string
        feature?:      string
      }
      setRequired(detail.requiredTier ?? 'pro')
      setMessage(detail.message ?? null)
      setFeature(detail.feature ?? null)
      setOpen(true)
    }
    window.addEventListener('show-upgrade-modal', handler)
    return () => window.removeEventListener('show-upgrade-modal', handler)
  }, [])

  if (!open) return null

  const plan = PLAN_DETAILS[required] ?? PLAN_DETAILS.pro

  const handleUpgrade = async () => {
    const res = await fetch('/api/payments/subscribe', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ plan: required, billing: 'monthly' }),
    })
    const data = await res.json() as { url?: string; checkoutUrl?: string }
    const url = data.url ?? data.checkoutUrl
    if (url) window.location.href = url
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#151b24] border border-[#1a2030] rounded-xl w-full max-w-sm">

        <div className="flex items-center justify-between p-4 border-b border-[#1a2030]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#00e5c8]" />
            <span className="text-white font-semibold text-sm">
              Upgrade to {plan.label}
            </span>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {feature === 'Forge Extreme Desktop' && (
            <Monitor className="w-10 h-10 text-[#00e5c8] mx-auto" />
          )}

          {message && (
            <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {message}
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-white">{plan.price}</span>
              <span className="text-sm text-gray-400">{plan.credits}</span>
            </div>
            <ul className="space-y-1.5">
              {plan.highlights.map(h => (
                <li key={h} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="text-[#00e5c8] text-base leading-none">·</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleUpgrade}
            className="w-full py-2.5 bg-[#00e5c8] text-black font-semibold rounded-lg text-sm hover:bg-[#00f0d5] transition"
          >
            Upgrade now →
          </button>

          <a
            href="/upgrade"
            className="block text-center text-[11px] text-gray-500 hover:text-gray-300 transition"
          >
            Compare all plans
          </a>

        </div>
      </div>
    </div>
  )
}
