'use client'

import { useQuery } from '@tanstack/react-query'
import { useUIStore } from '@/store/ui'

function HexIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
    </svg>
  )
}

function UserMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function TokenBar() {
  const { openModal } = useUIStore()

  const { data: credits } = useQuery({
    queryKey: ['credits-balance'],
    queryFn: async () => {
      const res = await fetch('/api/credits/balance', { credentials: 'include' })
      if (!res.ok) return { balance: 0 }
      return res.json() as Promise<{ balance: number }>
    },
    refetchInterval: 30_000,
  })

  const balance = credits?.balance ?? 0
  const isLow = balance < 50

  return (
    <div className="fixed top-0 inset-x-0 h-10 bg-[#0d1117] border-b border-[#1a1f2e] flex items-center justify-between px-4 z-50">
      {/* Left: brand */}
      <span className="text-[#00e5c8] font-bold text-sm tracking-tight">
        Cinematic Forge
        <span className="ml-1.5 text-gray-600 font-normal text-xs">by INNOVATIVE</span>
      </span>

      {/* Center: mode switcher placeholder — TopBar handles this */}
      <div />

      {/* Right: balance + CTA + user */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 ${isLow ? 'text-red-400' : 'text-white'}`}>
          <HexIcon />
          <span className="text-sm font-mono tabular-nums">{balance.toLocaleString()}</span>
          <span className="text-gray-600 text-xs">credits</span>
        </div>

        <button
          onClick={() => openModal('credit_purchase')}
          className="text-xs px-2.5 py-1 rounded border border-[#00e5c8]/40 text-[#00e5c8] hover:border-[#00e5c8] hover:bg-[#00e5c8]/8 transition"
        >
          + Get Credits
        </button>

        <button
          title="Account"
          className="w-7 h-7 rounded-full bg-[#1a1f2e] border border-[#2a3040] flex items-center justify-center text-gray-400 hover:text-white hover:border-[#3a4050] transition"
        >
          <UserMenuIcon />
        </button>
      </div>
    </div>
  )
}
