'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!)

const PRESET_AMOUNTS = [
  { usd: 10,  credits: 160,  label: '$10'  },
  { usd: 25,  credits: 400,  label: '$25'  },
  { usd: 50,  credits: 800,  label: '$50'  },
  { usd: 100, credits: 1600, label: '$100' },
]

function DepositForm({ onClose }: { onClose: () => void }) {
  const stripe   = useStripe()
  const elements = useElements()

  const [selectedAmount, setSelectedAmount] = useState(PRESET_AMOUNTS[1])
  const [customAmount,   setCustomAmount]   = useState('')
  const [isProcessing,   setIsProcessing]   = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)

  const amountUSD   = customAmount ? parseFloat(customAmount) : selectedAmount.usd
  const credits     = Math.floor(amountUSD * 16)
  const platformFee = (amountUSD * 0.20).toFixed(2)

  const handleDeposit = async () => {
    if (!stripe || !elements) return
    if (amountUSD < 5) { setError('Minimum deposit is $5'); return }

    setIsProcessing(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/deposit', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ amountUSD }),
      })
      const { clientSecret } = await res.json() as { clientSecret: string }

      const card = elements.getElement(CardElement)!
      const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      })

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed')
        return
      }

      setSuccess(true)
      setTimeout(onClose, 2000)

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setIsProcessing(false)
    }
  }

  if (success) return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-white font-semibold">Deposit confirmed</div>
      <div className="text-[#00e5c8] text-sm mt-1">{credits} credits added</div>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-white font-semibold">Add Credits</h3>

      <div className="grid grid-cols-4 gap-2">
        {PRESET_AMOUNTS.map(preset => (
          <button
            key={preset.usd}
            onClick={() => { setSelectedAmount(preset); setCustomAmount('') }}
            className={`p-2 rounded-lg text-center border transition ${
              selectedAmount.usd === preset.usd && !customAmount
                ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                : 'border-[#2a3040] text-gray-400 hover:border-[#3a4050]'
            }`}
          >
            <div className="font-semibold text-sm">{preset.label}</div>
            <div className="text-[10px] opacity-70">{preset.credits} cr</div>
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Custom amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
          <input
            type="number"
            min="5"
            max="500"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            placeholder="Enter amount"
            className="w-full pl-7 pr-3 py-2 bg-[#0d1117] border border-[#2a3040] rounded text-white text-sm"
          />
        </div>
      </div>

      <div className="bg-[#0d1117] rounded-lg p-3 space-y-1 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Deposit</span>
          <span>${amountUSD.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Platform fee (20%)</span>
          <span>-${platformFee}</span>
        </div>
        <div className="flex justify-between text-white font-semibold border-t border-[#1a2030] pt-1 mt-1">
          <span>Credits added</span>
          <span className="text-[#00e5c8]">{credits} credits</span>
        </div>
        <div className="text-gray-600 text-[10px] mt-1">
          Remaining 80% held in Stripe — drawn automatically as you generate
        </div>
      </div>

      <div className="p-3 bg-[#0d1117] border border-[#2a3040] rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                color:           '#ffffff',
                fontSize:        '14px',
                '::placeholder': { color: '#6b7280' },
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="text-red-400 text-xs p-2 bg-red-500/10 border border-red-500/30 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleDeposit}
        disabled={isProcessing || !stripe}
        className="w-full py-3 bg-[#00e5c8] text-black font-semibold rounded-lg disabled:opacity-40"
      >
        {isProcessing ? 'Processing...' : `Deposit $${amountUSD.toFixed(2)}`}
      </button>
    </div>
  )
}

export function DepositModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-[#151b24] border border-[#1a2030] rounded-xl w-[420px]">
        <div className="flex items-center justify-between p-4 border-b border-[#1a2030]">
          <span className="text-white font-semibold">Add Credits</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <Elements stripe={stripePromise}>
          <DepositForm onClose={onClose} />
        </Elements>
      </div>
    </div>
  )
}
