'use client'

import { Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useUserTier } from '@/hooks/useUserTier'
import { TIER_DISPLAY_NAMES } from '@/lib/access/tiers'

interface FeatureLockProps {
  requiredTier: 'studio' | 'ultimate'
  featureName:  string
  children:     React.ReactNode
}

export function FeatureLock({ requiredTier, featureName, children }: FeatureLockProps) {
  const { canUseStudio, canUseUltimate, isAdmin } = useUserTier()
  const router = useRouter()

  const hasAccess = isAdmin
    || (requiredTier === 'studio' && canUseStudio)
    || (requiredTier === 'ultimate' && canUseUltimate)

  if (hasAccess) return <>{children}</>

  const label = TIER_DISPLAY_NAMES[requiredTier]

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-30 select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070d1a]/80 rounded-lg backdrop-blur-sm">
        <Lock className="w-6 h-6 text-white/40 mb-2" />
        <p className="text-sm font-semibold text-white/70">{featureName}</p>
        <p className="text-[11px] text-gray-500 mb-3">
          Requires {label} subscription
        </p>
        <button
          onClick={() => router.push('/upgrade')}
          className="px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-[#00e5c8] text-black hover:bg-[#00f0d5] transition"
        >
          Upgrade to {label}
        </button>
      </div>
    </div>
  )
}
