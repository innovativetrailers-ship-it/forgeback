'use client'

import { Lock } from 'lucide-react'
import { useUserTier } from '@/hooks/useUserTier'
import { getRequiredUpgrade } from '@/lib/access/tiers'

const MODES = [
  { id: 'simple',      label: 'Simple',      feature: '' },
  { id: 'advanced',    label: 'Advanced',    feature: 'mode_advanced' },
  { id: 'director',    label: 'AI Director', feature: 'mode_director' },
  { id: 'film_series', label: 'Film Series', feature: 'mode_film_series' },
]

interface Props {
  active:   string
  onChange: (mode: string) => void
}

export function ModeTabs({ active, onChange }: Props) {
  const { tier, isAdmin } = useUserTier()

  return (
    <div className="flex gap-1">
      {MODES.map(mode => {
        const required = mode.feature ? getRequiredUpgrade(tier, mode.feature) : null
        const locked   = !isAdmin && !!required
        const isActive = active === mode.id

        return (
          <button
            key={mode.id}
            onClick={() => {
              if (locked) {
                window.dispatchEvent(new CustomEvent('show-upgrade-modal', {
                  detail: { requiredTier: required, feature: mode.id },
                }))
                return
              }
              onChange(mode.id)
            }}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              isActive && !locked
                ? 'bg-[#00e5c8] text-black'
                : locked
                ? 'text-gray-600 cursor-pointer hover:text-gray-400'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {mode.label}
            {locked && <Lock className="w-3 h-3 opacity-60" />}
          </button>
        )
      })}
    </div>
  )
}
