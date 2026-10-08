'use client'

import { useUIStore, type PanelId } from '@/store/ui'
import { SFXMakeupPanel } from '@/components/panels/SFXMakeupPanel'
import { GreenScreenPanel } from '@/components/panels/GreenScreenPanel'
import { CharacterCastPanel } from '@/components/panels/CharacterCastPanel'
import { AIDirectorPanel } from '@/components/panels/AIDirectorPanel'
import { ContinuityPanel } from '@/components/panels/ContinuityPanel'
import { LocationPanel } from '@/components/panels/LocationPanel'
import { GeneratePanel } from '@/components/panels/GeneratePanel'
import { LibraryPanel } from '@/components/panels/LibraryPanel'
import { TrainingStudioPanel } from '@/components/training/TrainingStudioPanel'
import { TranslatePanel } from '@/components/panels/TranslatePanel'
import { ComingPanel, TransitionsPanel, AudioStudioPanel, VfxPanel, CgiPanel, StockPanel, BrandKitPanel, AvatarPanel, HighlightPanel } from '@/components/panels/RailTools'
import { X } from 'lucide-react'

const PANEL_MAP: Partial<Record<PanelId, React.ReactNode>> = {
  generate:    <GeneratePanel />,
  vault:       <ComingPanel label="Character vault" run="use Cast for the people in this film" />,
  library:     <LibraryPanel />,
  location:    <LocationPanel />,
  cast:        <CharacterCastPanel />,
  training:    <TrainingStudioPanel />,
  makeup:      <SFXMakeupPanel />,
  sfx_makeup:  <SFXMakeupPanel />,
  greenscreen: <GreenScreenPanel />,
  cgi:         <CgiPanel />,
  vfx:         <VfxPanel />,
  transitions: <TransitionsPanel />,
  audio:       <AudioStudioPanel />,
  stock:       <StockPanel />,
  script:      <ComingPanel label="Script" run="the script editor is not mounted" />,
  storyboard:  <ComingPanel label="Storyboard" run="the storyboard is not mounted" />,
  avatar:      <AvatarPanel />,
  translate:   <TranslatePanel />,
  highlight:   <HighlightPanel />,
  brandkit:    <BrandKitPanel />,
  settings:    <ComingPanel label="Settings" run="settings are not mounted on this rail" />,
  ai_director: <AIDirectorPanel />,
  continuity:  <ContinuityPanel />,
  audio_mix:   <AudioStudioPanel />,
}

export function LeftPanel() {
  const { activePanel, setActivePanel } = useUIStore()

  if (!activePanel) return null

  const PANEL_LABELS: Record<PanelId, string> = {
    generate: 'Generate', vault: 'Vault', library: 'Library',
    location: 'Locations', cast: 'Cast', training: 'Training Studio',
    makeup: 'SFX Makeup',
    sfx_makeup: 'SFX Makeup', greenscreen: 'Green Screen', cgi: 'CGI Insert', vfx: 'VFX',
    transitions: 'Transitions', audio: 'Audio', stock: 'Stock Media',
    script: 'Script', storyboard: 'Storyboard', avatar: 'AI Avatar',
    translate: 'Translate', highlight: 'Highlight Reel', highlights: 'Highlights',
    brandkit: 'Brand Kit', brand_kit: 'Brand Kit',
    settings: 'Settings', ai_director: 'AI Director',
    continuity: 'Continuity', audio_mix: 'Audio Mix',
    transcript: 'Transcript', multicam: 'Multi-Camera',
    plugin: 'Plugins', camera_ingest: 'Camera Ingest',
    review: 'Client Review', particle: 'Particle FX',
    performance: 'Performance Capture',
  }

  return (
    <aside className={`${activePanel === 'training' || activePanel === 'vfx' ? 'w-[520px]' : 'w-[260px]'} shrink-0 flex flex-col bg-[var(--bg-elevated)] border-r border-[var(--border)] overflow-hidden`}>
      <div className="flex items-center justify-between px-3 h-8 border-b border-[var(--border)] shrink-0">
        <span className="panel-label">{PANEL_LABELS[activePanel]}</span>
        <button
          onClick={() => setActivePanel(null)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          title="Close panel"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {PANEL_MAP[activePanel] ?? <ComingPanel label={PANEL_LABELS[activePanel] ?? 'Panel'} run="this tool is not mounted" />}
      </div>
    </aside>
  )
}
