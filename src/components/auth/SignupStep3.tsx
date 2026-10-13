'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignupStore } from '@/store/signup'

const PLAN_PRICES: Record<string, Record<string, number>> = {
  pro:      { monthly: 19, yearly: 190 },
  studio:   { monthly: 49, yearly: 490 },
  ultimate: { monthly: 99, yearly: 990 },
}

export function SignupStep3() {
  const router = useRouter()
  const { plan, billing, userId, setStep } = useSignupStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const price = plan !== 'free' ? PLAN_PRICES[plan]?.[billing] : 0

  const handleFreeTrial = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planId: 'free' }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Activation failed'); return }
      router.push('/simple')
    } catch (err) {
      console.warn("[caught] src/components/auth/SignupStep3.tsx:31", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleStripe = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan, billing, userId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError(data.error ?? 'Failed to start checkout')
    } catch (err) {
      console.warn("[caught] src/components/auth/SignupStep3.tsx:50", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError('Network error')
    } finally {
      setLoading(false)
    }
  }


  if (plan === 'free') {
    return (
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Start your free trial</h2>
        <p className="text-gray-500 text-sm mb-6">50 credits included. No credit card required.</p>

        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

        <button
          onClick={handleFreeTrial}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-[#00e5c8] text-[#0d1117] font-bold text-sm hover:bg-[#00e5c8]/90 disabled:opacity-50 transition mb-3"
        >
          {loading ? 'Activating...' : 'Start Free Trial →'}
        </button>

        <button onClick={() => setStep(2)} className="w-full py-2 text-gray-500 text-sm hover:text-white transition">
          ← Back to plans
        </button>
      </div>
    )
  }

  const planName = { pro: 'Pro', studio: 'Studio', ultimate: 'Ultimate' }[plan] ?? plan

  return (
    <div>
      <h2 className="text-white font-bold text-xl mb-1">Complete payment</h2>
      <p className="text-gray-500 text-sm mb-2">
        {planName} plan &middot; ${price}/{billing === 'monthly' ? 'mo' : 'yr'}
      </p>

      <div className="bg-[#1a1f2e] rounded-lg p-3 mb-6 text-xs text-gray-400 border border-[#2a3040]">
        <div className="flex justify-between">
          <span>{planName} ({billing})</span>
          <span className="text-white font-mono">${price}</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

      {/* Stripe */}
      <button
        onClick={handleStripe}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-lg bg-[#635BFF] text-white font-semibold text-sm hover:bg-[#635BFF]/90 disabled:opacity-50 transition mb-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.91 5.555C4.437 22.773 7.354 24 11.044 24c2.654 0 4.88-.61 6.476-1.804 1.686-1.263 2.554-3.146 2.554-5.528 0-4.08-2.49-5.787-6.098-7.518z"/>
        </svg>
        Pay with Stripe
      </button>

      <button onClick={() => setStep(2)} className="w-full py-2 text-gray-500 text-sm hover:text-white transition text-center">
        ← Back to plans
      </button>
    </div>
  )
}
