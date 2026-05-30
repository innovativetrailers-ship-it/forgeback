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
import { X } from 'lucide-react'

// Lazy placeholders for panels
function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-10 h-10 rounded-full bg-[var(--teal-glow)] border border-[var(--teal-border)] flex items-center justify-center mb-3">
        <span className="text-[var(--teal-bright)] text-lg">⚡</span>
      </div>
      <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">{label}</p>
      <p className="text-[10px] text-[var(--text-tertiary)]">Select a clip or use the timeline below</p>
    </div>
  )
}

const PANEL_MAP: Partial<Record<PanelId, React.ReactNode>> = {
  generate:    <GeneratePanel />,
  vault:       <PlaceholderPanel label="Character Vault" />,
  library:     <LibraryPanel />,
  location:    <LocationPanel />,
  cast:        <CharacterCastPanel />,
  makeup:      <SFXMakeupPanel />,
  greenscreen: <GreenScreenPanel />,
  cgi:         <PlaceholderPanel label="CGI Insertion" />,
  vfx:         <PlaceholderPanel label="VFX Compositor" />,
  transitions: <PlaceholderPanel label="Transitions" />,
  audio:       <PlaceholderPanel label="Audio Studio" />,
  stock:       <PlaceholderPanel label="Stock Media" />,
  script:      <PlaceholderPanel label="Script Editor" />,
  storyboard:  <PlaceholderPanel label="Storyboard" />,
  avatar:      <PlaceholderPanel label="AI Avatar" />,
  translate:   <PlaceholderPanel label="Auto-Translate" />,
  highlight:   <PlaceholderPanel label="Highlight Reel" />,
  brandkit:    <PlaceholderPanel label="Brand Kit" />,
  settings:    <PlaceholderPanel label="Settings" />,
  ai_director: <AIDirectorPanel />,
  continuity:  <ContinuityPanel />,
  audio_mix:   <PlaceholderPanel label="Audio Mix" />,
}

export function LeftPanel() {
  const { activePanel, setActivePanel } = useUIStore()

  if (!activePanel) return null

  const PANEL_LABELS: Record<PanelId, string> = {
    generate: 'Generate', vault: 'Vault', library: 'Library',
    location: 'Locations', cast: 'Cast', makeup: 'SFX Makeup',
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
    <aside className="w-[260px] shrink-0 flex flex-col bg-[var(--bg-elevated)] border-r border-[var(--border)] overflow-hidden">
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
        {PANEL_MAP[activePanel] ?? <PlaceholderPanel label={PANEL_LABELS[activePanel]} />}
      </div>
    </aside>
  )
}
