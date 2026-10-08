'use client'

import { useUIStore, type PanelId } from '@/store/ui'
import { cn } from '@/lib/utils'
import {
  Wand2, Folder, Library, MapPin, Users, Sparkles,
  Layers, Video, Film, Music, Image, FileText,
  Clapperboard, Star, Globe, Palette, BarChart2,
  Settings, Boxes,
} from 'lucide-react'

type RailItem = { id: PanelId; icon: React.ReactNode; label: string; dividerBefore?: boolean }

const TOP_ITEMS: RailItem[] = [
  { id: 'generate',    icon: <Wand2 size={16} />,       label: 'Generate' },
  { id: 'vault',       icon: <Folder size={16} />,       label: 'Vault' },
  { id: 'library',     icon: <Library size={16} />,      label: 'Library' },
  { id: 'location',    icon: <MapPin size={16} />,        label: 'Locations' },
  { id: 'cast',        icon: <Users size={16} />,         label: 'Cast' },
  { id: 'training',    icon: <Boxes size={16} />,         label: 'Training Studio' },
  { id: 'makeup',      icon: <Sparkles size={16} />,      label: 'Makeup/SFX', dividerBefore: true },
  { id: 'greenscreen', icon: <Layers size={16} />,        label: 'Green Screen' },
  { id: 'cgi',         icon: <Video size={16} />,         label: 'CGI Insert' },
  { id: 'vfx',         icon: <Film size={16} />,          label: 'VFX' },
  { id: 'transitions', icon: <Clapperboard size={16} />,  label: 'Transitions' },
  { id: 'audio',       icon: <Music size={16} />,         label: 'Audio', dividerBefore: true },
  { id: 'stock',       icon: <Image size={16} />,         label: 'Stock Media' },
  { id: 'script',      icon: <FileText size={16} />,      label: 'Script' },
  { id: 'storyboard',  icon: <Star size={16} />,          label: 'Storyboard' },
  { id: 'avatar',      icon: <Users size={16} />,         label: 'AI Avatar' },
  { id: 'translate',   icon: <Globe size={16} />,         label: 'Translate', dividerBefore: true },
  { id: 'highlight',   icon: <BarChart2 size={16} />,     label: 'Highlight Reel' },
  { id: 'brandkit',    icon: <Palette size={16} />,       label: 'Brand Kit' },
]

const COMING: Partial<Record<PanelId, string>> = {
  vault: 'Coming — use Cast',
  script: 'Coming — script editor is not mounted',
  storyboard: 'Coming — storyboard is not mounted',
  settings: 'Coming — settings are not on this rail',
}

const BOTTOM_ITEMS: RailItem[] = [
  { id: 'settings', icon: <Settings size={16} />, label: 'Settings' },
]

export function IconRail() {
  const { activePanel, togglePanel } = useUIStore()

  return (
    <aside className="flex flex-col items-center w-11 py-1.5 gap-0.5 bg-[var(--bg-elevated)] border-r border-[var(--border)] shrink-0 overflow-y-auto overflow-x-hidden">
      {TOP_ITEMS.map((item) => (
        <div key={item.id} className="w-full">
          {item.dividerBefore && <div className="mx-auto my-1 w-5 h-px bg-[var(--border)]" />}
          <RailButton item={item} active={activePanel === item.id} coming={COMING[item.id]} onToggle={() => { if (!COMING[item.id]) togglePanel(item.id) }} />
        </div>
      ))}

      <div className="flex-1" />
      <div className="mx-auto my-1 w-5 h-px bg-[var(--border)]" />

      {BOTTOM_ITEMS.map((item) => (
        <RailButton key={item.id} item={item} active={activePanel === item.id} coming={COMING[item.id]} onToggle={() => { if (!COMING[item.id]) togglePanel(item.id) }} />
      ))}
    </aside>
  )
}

function RailButton({ item, active, coming, onToggle }: { item: RailItem; active: boolean; coming?: string; onToggle: () => void }) {
  return (
    <div className="relative group flex justify-center w-full">
      <button
        onClick={onToggle}
        disabled={Boolean(coming)}
        title={coming ?? item.label}
        className={cn(
          'rail-btn',
          active && 'active',
          coming && 'opacity-40'
        )}
      >
        {item.icon}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity delay-150">
        <div className="bg-[#1e2636] border border-[var(--border-mid)] px-2 py-1 rounded text-[11px] text-[var(--text-primary)] whitespace-nowrap shadow-lg">
          {coming ?? item.label}
        </div>
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1e2636]" />
      </div>
    </div>
  )
}
