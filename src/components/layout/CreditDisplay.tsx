'use client'

import { useCredits } from '@/hooks/useCredits'

export function CreditDisplay() {
  const { credits, isAdmin, unlimited, isLoading } = useCredits()

  if (isLoading) return null

  if (isAdmin || unlimited) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#00e5c8]/10 border border-[#00e5c8]/20">
        <span className="text-[#00e5c8] text-sm font-bold">∞</span>
        <span className="text-[10px] text-[#00e5c8]/70">Dev</span>
      </div>
    )
  }

  const isLow = credits < 50

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
      isLow ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'
    }`}>
      <span className={`text-sm font-bold ${isLow ? 'text-amber-400' : 'text-white'}`}>
        {credits.toLocaleString()}
      </span>
      <span className={`text-[10px] ${isLow ? 'text-amber-400/70' : 'text-gray-400'}`}>
        credits
      </span>
      {isLow && <span className="text-[9px] text-amber-400">· low</span>}
    </div>
  )
}
