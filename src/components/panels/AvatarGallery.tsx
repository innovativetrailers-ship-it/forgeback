'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, UserCircle2 } from 'lucide-react'

interface Avatar {
  id:           string
  name:         string
  type:         string
  videoUrl:     string
  thumbnailUrl: string | null
}

interface Props {
  onSelect?: (avatar: Avatar) => void
  selected?: string
}

// 30 stock avatars — pre-generated, hosted on R2
const STOCK_AVATARS: Avatar[] = [
  { id: 'stock-01', name: 'Alexandra',  type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/alexandra.jpg' },
  { id: 'stock-02', name: 'Marcus',     type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/marcus.jpg' },
  { id: 'stock-03', name: 'Priya',      type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/priya.jpg' },
  { id: 'stock-04', name: 'Chen',       type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/chen.jpg' },
  { id: 'stock-05', name: 'Sofia',      type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/sofia.jpg' },
  { id: 'stock-06', name: 'James',      type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/james.jpg' },
  { id: 'stock-07', name: 'Yuki',       type: 'anime',     videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/yuki.jpg' },
  { id: 'stock-08', name: 'Luna',       type: 'anime',     videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/luna.jpg' },
  { id: 'stock-09', name: 'Kai',        type: 'anime',     videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/kai.jpg' },
  { id: 'stock-10', name: 'Amara',      type: 'realistic', videoUrl: '', thumbnailUrl: 'https://media.cinema.growthengine.ai/avatars/stock/amara.jpg' },
]

export function AvatarGallery({ onSelect, selected }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['avatars'],
    queryFn:  async () => {
      const res = await fetch('/api/avatar/list')
      if (!res.ok) return { avatars: [] }
      return res.json() as Promise<{ avatars: Avatar[] }>
    },
  })

  const userAvatars = data?.avatars ?? []
  const all = [...userAvatars, ...STOCK_AVATARS]

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-white font-semibold text-sm">Avatar Library</h3>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[#00e5c8]" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {all.map(avatar => (
          <button
            key={avatar.id}
            onClick={() => onSelect?.(avatar)}
            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
              selected === avatar.id
                ? 'border-[#00e5c8]'
                : 'border-transparent hover:border-[#3a4050]'
            }`}
          >
            {avatar.thumbnailUrl ? (
              <img
                src={avatar.thumbnailUrl}
                alt={avatar.name}
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full bg-[#1a1f2e] flex items-center justify-center">
                <UserCircle2 size={28} className="text-gray-600" />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
              <span className="text-[9px] text-white truncate block">{avatar.name}</span>
            </div>
          </button>
        ))}
      </div>

      {all.length === 0 && !isLoading && (
        <p className="text-xs text-gray-500 text-center py-4">No avatars yet</p>
      )}
    </div>
  )
}
