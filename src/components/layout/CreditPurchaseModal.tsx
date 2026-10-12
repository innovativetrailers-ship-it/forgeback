'use client'

import { useState } from 'react'
import { CREDIT_PACKS, type CreditPack } from '@cinema/core'
import { useUIStore } from '@/store/ui'
import { useQueryClient } from '@tanstack/react-query'

export function CreditPurchaseModal() {
  const { activeModal, closeModal } = useUIStore()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (activeModal !== 'credit_purchase') return null

  async function handleStripe(pack: CreditPack) {
    setLoading(pack.credits)
    setError(null)
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: pack.credits }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Payment failed')
      window.location.href = data.url
    } catch (err) {
      console.warn("[caught] src/components/layout/CreditPurchaseModal.tsx:41", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError((err as Error).message)
    } finally {
      setLoading(null)
    }
  }


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-[#1a1f2e] rounded-xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1f2e]">
          <div>
            <h2 className="text-white font-semibold text-lg">Get Credits</h2>
            <p className="text-gray-500 text-xs mt-0.5">Credits never expire</p>
          </div>
          <button
            onClick={closeModal}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-[#1a1f2e] transition"
          >
            ✕
          </button>
        </div>

        {/* Packs */}
        <div className="p-6 space-y-3">
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.credits}
              className={`relative rounded-xl border p-4 ${
                pack.popular
                  ? 'border-[#00e5c8]/50 bg-[#00e5c8]/5'
                  : 'border-[#1a1f2e] bg-[#111620]'
              }`}
            >
              {pack.popular && (
                <span className="absolute -top-2.5 left-4 text-[10px] bg-[#00e5c8] text-black font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Most Popular
                </span>
              )}

              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-white font-semibold">{pack.label}</span>
                  <span className="ml-2 text-gray-500 text-sm">A${(pack.priceAudCents / 100).toFixed(0)}</span>
                  <span className="ml-1 text-gray-600 text-xs">
                    (A${((pack.priceAudCents / 100) / pack.credits * 100).toFixed(1)}¢/cr)
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleStripe(pack)}
                  disabled={loading !== null}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium bg-[#00e5c8] text-black hover:bg-[#00d4b8] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loading === pack.credits ? '...' : 'Pay with Card'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 text-center text-gray-600 text-xs">
          Payments secured by Stripe · Credits are non-refundable
        </div>
      </div>
    </div>
  )
}
