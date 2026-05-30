'use client'
import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { PLANS } from './PlanSelector'

const STRIPE_PRICE_IDS: Record<string, Record<string, string>> = {
  pro:      { monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? '', yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ?? '' },
  studio:   { monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STUDIO_MONTHLY ?? '', yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STUDIO_YEARLY ?? '' },
  ultimate: { monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTIMATE_MONTHLY ?? '', yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTIMATE_YEARLY ?? '' },
}

interface PaymentOptionsProps {
  planId: string
  billing: 'monthly' | 'yearly'
  onSuccess: () => void
  onBack: () => void
}

export function PaymentOptions({ planId, billing, onSuccess, onBack }: PaymentOptionsProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return null

  const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice

  const handleStripe = async () => {
    setLoading(true)
    setError(null)
    try {
      const priceId = STRIPE_PRICE_IDS[planId]?.[billing]
      const res = await fetch('/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to create checkout')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#151b24] border border-[#1a2030] rounded-xl p-6">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-white text-sm mb-4 flex items-center gap-1"
      >
        ← Back
      </button>
      <h2 className="text-white text-xl font-bold mb-1">{plan.name}</h2>
      <p className="text-3xl font-bold text-white mb-6">
        ${price}
        <span className="text-sm text-gray-400 font-normal">
          /{billing === 'monthly' ? 'mo' : 'yr'}
        </span>
      </p>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={() => void handleStripe()}
          disabled={loading}
          className="w-full py-3 bg-[#00e5c8] text-black font-semibold rounded-lg hover:bg-[#00e5c8]/90 flex items-center justify-center gap-2 disabled:opacity-60 transition"
        >
          <CreditCard size={16} />
          {loading ? 'Redirecting…' : 'Pay with Card'}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        Secure payment · Stripe encrypted · Cancel anytime
      </p>
    </div>
  )
}
