'use client'

export type GenerationTier = 'draft' | 'standard' | 'cinematic' | 'film'

interface TierConfig {
  label:       string
  description: string
  cost:        number
  color:       string
}

export const TIER_CONFIG: Record<GenerationTier, TierConfig> = {
  draft:     { label: 'Quick Draft',  description: '~10s · fal.ai fast', cost: 2,  color: 'text-gray-400' },
  standard:  { label: 'Standard',     description: '~30s · balanced',    cost: 8,  color: 'text-blue-400' },
  cinematic: { label: 'Cinematic',    description: '~60s · high quality', cost: 25, color: 'text-[#00e5c8]' },
  film:      { label: 'Film Grade',   description: '~90s · best quality', cost: 40, color: 'text-violet-400' },
}

interface Props {
  value:    GenerationTier
  onChange: (tier: GenerationTier) => void
  compact?: boolean
}

export function TierSelector({ value, onChange, compact = false }: Props) {
  const tiers = Object.entries(TIER_CONFIG) as [GenerationTier, TierConfig][]

  if (compact) {
    return (
      <div className="flex gap-1">
        {tiers.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex-1 py-1.5 rounded text-[10px] border transition ${
              value === key
                ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                : 'border-[#2a3040] bg-[#1a1f2e] text-gray-400 hover:border-[#3a4050]'
            }`}
          >
            {cfg.label.split(' ')[0]}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiers.map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`p-3 rounded-lg border text-left transition ${
            value === key
              ? 'border-[#00e5c8] bg-[#00e5c8]/10'
              : 'border-[#2a3040] bg-[#1a1f2e] hover:border-[#3a4050]'
          }`}
        >
          <div className={`text-xs font-semibold mb-0.5 ${value === key ? 'text-[#00e5c8]' : 'text-white'}`}>
            {cfg.label}
          </div>
          <div className="text-[10px] text-gray-500">{cfg.description}</div>
          <div className={`text-[10px] mt-1 font-mono ${cfg.color}`}>{cfg.cost} cr</div>
        </button>
      ))}
    </div>
  )
}
