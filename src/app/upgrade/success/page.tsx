'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { TIER_DISPLAY_NAMES } from '@/lib/access/tiers'
import type { SubscriptionTier } from '@/lib/access/tiers'

function UpgradeSuccessContent() {
  const searchParams = useSearchParams()
  const tier = (searchParams.get('tier') ?? 'pro') as SubscriptionTier
  const label = TIER_DISPLAY_NAMES[tier] ?? 'your plan'

  return (
    <div className="max-w-md text-center space-y-4">
      <CheckCircle2 className="w-14 h-14 text-[#00e5c8] mx-auto" />
      <h1 className="text-2xl font-bold">Welcome to {label}</h1>
      <p className="text-gray-400 text-sm">
        Your subscription is active. Credits refresh on each billing cycle.
      </p>
      <Link
        href="/simple"
        className="inline-block px-6 py-3 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5]"
      >
        Start creating
      </Link>
    </div>
  )
}

export default function UpgradeSuccessPage() {
  return (
    <div className="min-h-screen bg-[#070d1a] text-white flex items-center justify-center p-6">
      <Suspense fallback={
        <div className="max-w-md text-center space-y-4 animate-pulse">
          <div className="w-14 h-14 rounded-full bg-white/10 mx-auto" />
          <div className="h-8 bg-white/10 rounded mx-auto w-48" />
          <div className="h-4 bg-white/10 rounded mx-auto w-64" />
        </div>
      }>
        <UpgradeSuccessContent />
      </Suspense>
    </div>
  )
}
