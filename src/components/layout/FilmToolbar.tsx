'use client'

import { useUIStore, type FilmToolbarTab, type PanelId, type RightPanelId } from '@/store/ui'
import type { WorkspaceName } from '@/lib/editor/foundation'

const FILM_TABS: Array<{ id: FilmToolbarTab; label: string }> = [
  { id: 'script',      label: 'Script' },
  { id: 'storyboard',  label: 'Storyboard' },
  { id: 'director',    label: 'AI Director' },
  { id: 'continuity',  label: 'Continuity' },
  { id: 'cast',        label: 'Cast' },
  { id: 'locations',   label: 'Locations' },
  { id: 'colour',      label: 'Colour Grade' },
  { id: 'vfx_mix',     label: 'VFX Mix' },
  { id: 'audio_mix',   label: 'Audio Mix' },
  { id: 'greenscreen', label: 'Green Screen' },
  { id: 'sfx_makeup',  label: 'SFX Makeup' },
  { id: 'cgi',         label: 'CGI' },
]

const LEFT_PANEL_MAP: Partial<Record<FilmToolbarTab, PanelId>> = {
  script:      'script',
  storyboard:  'storyboard',
  cast:        'cast',
  locations:   'location',
  sfx_makeup:  'sfx_makeup',
  greenscreen: 'greenscreen',
  cgi:         'cgi',
}

const RIGHT_PANEL_MAP: Partial<Record<FilmToolbarTab, RightPanelId>> = {
  director:  'director',
  colour:    'colour',
  vfx_mix:   'vfx',
  audio_mix: 'audio',
}

export function FilmToolbar() {
  const { activeFilmTab, setActiveFilmTab, setActivePanel, setActiveRightPanel, setWorkspace } = useUIStore()

  const handleTabClick = (tab: FilmToolbarTab) => {
    const workspaceFor: Partial<Record<FilmToolbarTab, WorkspaceName>> = {
      colour: 'Colour',
      vfx_mix: 'Compositor',
      audio_mix: 'Audio',
      greenscreen: 'Look-dev',
      sfx_makeup: 'Look-dev',
    }
    if (workspaceFor[tab]) {
      setWorkspace(workspaceFor[tab]!, tab === 'greenscreen' ? 'greenscreen' : tab === 'sfx_makeup' ? 'makeup' : undefined)
      setActiveFilmTab(tab)
      return
    }
    const next = activeFilmTab === tab ? null : tab
    setActiveFilmTab(next)
    if (next && LEFT_PANEL_MAP[next]) setActivePanel(LEFT_PANEL_MAP[next]!)
    if (next && RIGHT_PANEL_MAP[next]) setActiveRightPanel(RIGHT_PANEL_MAP[next]!)
  }

  return (
    <div className="flex items-center h-8 border-b border-[#1a1f2e] overflow-x-auto scrollbar-none shrink-0 px-1">
      {FILM_TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => handleTabClick(id)}
          className={`px-3 py-1 text-[11px] rounded whitespace-nowrap transition shrink-0 ${
            activeFilmTab === id
              ? 'bg-[#00e5c8]/15 text-[#00e5c8] font-medium'
              : 'text-[var(--text-tertiary)] hover:text-white hover:bg-white/5'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
