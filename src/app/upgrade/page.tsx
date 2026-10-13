'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Download, Lock, Monitor, Zap } from 'lucide-react'
import { useUserTier } from '@/hooks/useUserTier'
import { TIER_DISPLAY_NAMES } from '@/lib/access/tiers'

const PLANS = [
  {
    id:       'pro' as const,
    label:    'Simple',
    price:    '$19',
    period:   '/mo or pay-as-you-go',
    color:    '#10b981',
    desc:     'Start creating with AI generation. No subscription required — just buy credits.',
    tokens:   '500 credits/month',
    highlight: false,
    noSubNote: 'Use with credits only — subscription optional',
    features: [
      'AI Simple Mode generation',
      'Director Mode (2 models)',
      'Standard + Cinematic quality',
      'Voice synthesis & music',
      'Location scouting & SFX',
      'Export HD video',
    ],
  },
  {
    id:       'studio' as const,
    label:    'Advanced',
    price:    '$49',
    period:   '/mo',
    color:    '#8b5cf6',
    desc:     'The full professional toolkit. Subscription required.',
    tokens:   '2,000 credits/month',
    highlight: true,
    noSubNote: null,
    features: [
      'Everything in Simple',
      'Director Mode (7 models)',
      'Film quality tier',
      'Voice cloning & collaboration',
      '4K + ProRes export',
      'Cognitive Director AI',
    ],
  },
  {
    id:       'ultimate' as const,
    label:    'Ultimate',
    price:    '$99',
    period:   '/mo',
    color:    '#00e5c8',
    desc:     'Every capability unlocked. Includes Forge Extreme desktop.',
    tokens:   '6,000 credits/month',
    highlight: false,
    noSubNote: null,
    features: [
      'Everything in Advanced',
      'Director Mode (21 models)',
      'ForgeFlow production tracking',
      'ForgeReview collaboration',
      'DCP & IMF export',
      'Forge Extreme desktop app',
    ],
  },
]

export default function UpgradePage() {
  const { tier, isAdmin, canDownload } = useUserTier()
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      const res = await fetch('/api/payments/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: planId, billing: 'monthly' }),
      })
      const data = await res.json() as { url?: string; checkoutUrl?: string }
      const url = data.url ?? data.checkoutUrl
      if (url) window.location.href = url
    } finally {
      setLoading(null)
    }
  }

  const isCurrentPlan = (planId: string) =>
    tier === planId || (isAdmin && planId === 'ultimate')

  return (
    <div className="min-h-screen bg-[#070d1a] text-white px-4 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Choose Your Plan</h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Simple works with credits only — no subscription needed.
            Advanced and Ultimate require an active subscription for full access.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {PLANS.map((plan) => {
            const isCurrent = isCurrentPlan(plan.id)
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? 'border-purple-500/60 bg-purple-500/5'
                    : 'border-white/10 bg-[#0d1425]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-purple-600 text-xs font-bold">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl font-bold">{plan.label}</span>
                    {plan.id === 'ultimate' && (
                      <Link
                        href="/download"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#00e5c8]/15 border border-[#00e5c8]/30 text-[#00e5c8] text-[10px] font-semibold hover:bg-[#00e5c8]/25 transition"
                      >
                        <Monitor className="w-3 h-3" />
                        Forge Extreme
                      </Link>
                    )}
                  </div>
                  <div className="text-3xl font-bold" style={{ color: plan.color }}>
                    {plan.price}
                    <span className="text-sm font-normal text-gray-400 ml-1">{plan.period}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{plan.desc}</p>
                  {plan.noSubNote && (
                    <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {plan.noSubNote}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1">{plan.tokens}</p>
                </div>

                <div className="flex-1 space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: plan.color }} />
                      <span className="text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="py-2.5 text-center text-sm text-white/50 border border-white/10 rounded-xl">
                    Current Plan ({TIER_DISPLAY_NAMES[plan.id]})
                  </div>
                ) : (
                  <button
                    onClick={() => void handleSubscribe(plan.id)}
                    disabled={!!loading}
                    className="py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50"
                    style={{ background: plan.highlight ? '#8b5cf6' : plan.color, color: '#000' }}
                  >
                    {loading === plan.id ? 'Redirecting…' : `Get ${plan.label}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="border border-[#00e5c8]/20 rounded-2xl p-6 bg-gradient-to-r from-[#00e5c8]/5 to-transparent flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Monitor className="w-10 h-10 text-[#00e5c8]" />
            <div>
              <h3 className="font-bold text-lg">Forge Extreme Desktop</h3>
              <p className="text-sm text-gray-400">
                Included with Ultimate — full NLE, colour, compositing, audio, ForgeFlow & ForgeReview.
              </p>
            </div>
          </div>
          {canDownload ? (
            <Link
              href="/download"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition"
            >
              <Download className="w-4 h-4" /> Download
            </Link>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Requires Ultimate</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
