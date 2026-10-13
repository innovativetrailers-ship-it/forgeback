'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useCredits } from '@/hooks/useCredits'
import { useUserTier } from '@/hooks/useUserTier'
import { useStudioStore, useEditorStore, type AppMode, type OutcomeTier } from '@/store/editor'
import { useUIStore, type FilmToolbarTab, type EditTool } from '@/store/ui'
import { CreditPurchaseModal } from '@/components/ui/CreditPurchaseModal'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { JobProgressBadge } from '@/components/ui/JobProgressBadge'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'
import { TIER_POLICY } from '@/lib/orchestration/tierPolicy'
import { usePlaybackStore } from '@/store/playbackStore'
import {
  Hexagon, LogOut, Settings, CreditCard, Loader2, Share2,
  Download, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  MousePointer2, Scissors, Paintbrush, Wind, Type,
  Save, AlertCircle, Monitor, Lock,
} from 'lucide-react'

// Forge Extreme (V3 desktop) — always links to /download (page handles tier gating).
function ForgeExtremeButton() {
  const { canDownload } = useUserTier()

  return (
    <Link
      href="/download"
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide transition-all border',
        canDownload
          ? 'bg-gradient-to-r from-[#00e5c8] to-[#00b8a0] text-black hover:from-[#00f0d5] hover:to-[#00c8ae] border-[#00e5c8]/30'
          : 'border-white/15 text-white/60 hover:border-[#00e5c8]/40 hover:text-white/80',
      )}
    >
      <Monitor className="w-3.5 h-3.5" />
      Download
      {canDownload
        ? <Download className="w-3 h-3 opacity-70" />
        : <Lock className="w-3 h-3 opacity-50" />}
    </Link>
  )
}

// ── Mode switcher ────────────────────────────────────────────
const MODES: Array<{ label: string; href: string; mode: AppMode }> = [
  { label: 'Simple',   href: '/simple',   mode: 'simple' },
  { label: 'Advanced', href: '/advanced', mode: 'advanced' },
  { label: 'Ultimate', href: '/ultimate', mode: 'ultimate' },
]

const APP_NAV: Array<{ label: string; href: string; mode?: AppMode }> = [
  ...MODES,
  { label: 'Download', href: '/download' },
]

const TIERS: Array<{ label: string; value: OutcomeTier }> = [
  { label: 'Draft',       value: 'Draft' },
  { label: 'Studio',      value: 'Studio' },
  { label: 'Blockbuster', value: 'Blockbuster' },
]

const WORKSPACE_TABS: Array<{ key: string; id: FilmToolbarTab; label: string; workspace: import('@/lib/editor/foundation').WorkspaceName; look?: 'makeup' | 'greenscreen' | 'location'; divider?: boolean }> = [
  { key: 'script', id: 'script', label: 'Script', workspace: 'Creator' },
  { key: 'storyboard', id: 'storyboard', label: 'Storyboard', workspace: 'Director' },
  { key: 'director', id: 'ai_director', label: 'AI Director', workspace: 'Director' },
  { key: 'continuity', id: 'continuity', label: 'Continuity', workspace: 'Director' },
  { key: 'cast', id: 'cast', label: 'Cast', workspace: 'Creator' },
  { key: 'locations', id: 'locations', label: 'Locations', workspace: 'Look-dev', look: 'location' },
  { key: 'edit', id: 'edit', label: 'Edit', workspace: 'Editor', divider: true },
  { key: 'colour', id: 'colour', label: 'Colour Grade', workspace: 'Colour', divider: true },
  { key: 'vfx', id: 'vfx_mix', label: 'VFX Mix', workspace: 'Compositor' },
  { key: 'audio', id: 'audio_mix', label: 'Audio Mix', workspace: 'Audio' },
  { key: 'green', id: 'greenscreen', label: 'Green Screen', workspace: 'Look-dev', look: 'greenscreen' },
  { key: 'makeup', id: 'sfx_makeup', label: 'SFX Makeup', workspace: 'Look-dev', look: 'makeup' },
  { key: 'cgi', id: 'cgi', label: 'CGI', workspace: 'Compositor' },
  { key: 'motion', id: 'motion', label: 'Motion & Camera', workspace: 'Motion' },
  { key: 'review', id: 'review', label: 'Review', workspace: 'Review', divider: true },
]

// Maps film toolbar tabs → left panel IDs
const FILM_TAB_TO_PANEL: Partial<Record<FilmToolbarTab, import('@/store/ui').PanelId>> = {
  script: 'script',
  storyboard: 'storyboard',
  director: 'ai_director',
  ai_director: 'ai_director',
  continuity: 'continuity',
  cast: 'cast',
  locations: 'location',
  vfx_mix: 'vfx',
  audio_mix: 'audio',
  greenscreen: 'greenscreen',
  sfx_makeup: 'sfx_makeup',
  cgi: 'cgi',
}

const EDIT_TOOLS: Array<{ id: EditTool; icon: React.ReactNode; label: string; key: string }> = [
  { id: 'select',       icon: <MousePointer2 size={13} />, label: 'Select',       key: 'V' },
  { id: 'razor',        icon: <Scissors size={13} />,      label: 'Razor',        key: 'C' },
  { id: 'repaint',      icon: <Paintbrush size={13} />,    label: 'Repaint',      key: 'R' },
  { id: 'motion_brush', icon: <Wind size={13} />,          label: 'Motion Brush', key: 'M' },
  { id: 'text',         icon: <Type size={13} />,          label: 'Text',         key: 'T' },
]

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const { balance, isAdmin, unlimited, isLoading: creditsLoading } = useCredits()
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  const { mode, setMode, activeTier, setTier, zoom, setZoom, isPlaying, setIsPlaying } = useStudioStore()
  const { filmToolbarTab, setFilmToolbarTab, editTool, setEditTool, projectName, setProjectName, autoSaveStatus, setActivePanel, addToast, workspace, setWorkspace, lookDev } = useUIStore()

  const isAdvancedOrUltimate = mode === 'advanced' || mode === 'ultimate'
  const isUltimate = mode === 'ultimate'

  // Sync mode with pathname
  useEffect(() => {
    const matched = MODES.find((m) => pathname.startsWith(m.href))
    if (matched && matched.mode !== mode) setMode(matched.mode)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const { selectedClipId } = useStudioStore()

  const activateTool = useCallback((tool: EditTool) => {
    setEditTool(tool)
    if (tool === 'repaint') {
      if (selectedClipId) {
        useUIStore.getState().openModal('repaint', { clipId: selectedClipId })
      } else {
        addToast('Select a clip in the timeline first, then use Repaint', 'info')
      }
    }
    if (tool === 'motion_brush') addToast('Motion Brush: paint on the preview to control motion direction', 'info')
    if (tool === 'razor') addToast('Razor: click a clip in the timeline to split it', 'info')
  }, [setEditTool, selectedClipId, addToast])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    const meta = e.metaKey || e.ctrlKey
    const key  = e.key.toLowerCase()

    // ── Tool shortcuts ──────────────────────────────────────────
    const toolMap: Record<string, EditTool> = {
      v: 'select', c: 'razor', r: 'repaint', m: 'motion_brush', t: 'text',
    }
    if (!meta && toolMap[key]) { activateTool(toolMap[key]); return }

    // ── Playback ────────────────────────────────────────────────
    if (e.code === 'Space') { e.preventDefault(); setIsPlaying(!isPlaying); return }

    // ── Undo / Redo ─────────────────────────────────────────────
    if (meta && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      usePlaybackStore.getState().undo()
      return
    }
    if (meta && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault()
      usePlaybackStore.getState().redo()
      return
    }

    // ── Save ────────────────────────────────────────────────────
    if (meta && key === 's') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('editor:save'))
      return
    }

    // ── Delete selected clip ────────────────────────────────────
    if (key === 'delete' || key === 'backspace') {
      const { selectedClipId: cid, removeClip } = useEditorStore.getState()
      if (cid) { e.preventDefault(); removeClip(cid) }
      return
    }

    // ── Nudge playhead (arrow keys, 1-frame ≈ 1/24s) ───────────
    if (key === 'arrowleft' && !meta) {
      e.preventDefault()
      const { playheadTime, setPlayheadTime } = useEditorStore.getState()
      setPlayheadTime(Math.max(0, playheadTime - (e.shiftKey ? 1 : 1 / 24)))
      return
    }
    if (key === 'arrowright' && !meta) {
      e.preventDefault()
      const { playheadTime, setPlayheadTime } = useEditorStore.getState()
      setPlayheadTime(playheadTime + (e.shiftKey ? 1 : 1 / 24))
      return
    }

    // ── JKL playback controls (editing keyboard standard) ───────
    if (key === 'j') { e.preventDefault(); setIsPlaying(false); return }
    if (key === 'k') { e.preventDefault(); setIsPlaying(false); return }
    if (key === 'l') { e.preventDefault(); setIsPlaying(true);  return }

    // ── Generate shortcut (Cmd/Ctrl + G) ────────────────────────
    if (meta && key === 'g') {
      e.preventDefault()
      useUIStore.getState().setActivePanel('generate')
      return
    }
  }, [isPlaying, setIsPlaying, activateTool])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const user = session?.user
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <>
      {/* ── ROW 1 — Brand + Mode + Account (42px) ── */}
      <div className="flex items-center gap-3 px-3 h-[42px] border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        {/* Logo + project name */}
        <div className="flex items-center gap-2 shrink-0">
          <BrandLogo href="/simple" size={28} wordmark="CINÉMA" />
          <span className="text-[var(--text-tertiary)]">·</span>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="text-xs text-[var(--text-secondary)] bg-transparent border-none outline-none hover:text-[var(--text-primary)] focus:text-[var(--text-primary)] min-w-0 w-36"
          />
        </div>

        {/* Mode switcher + tier */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {APP_NAV.map((m) => {
            const active = m.mode ? mode === m.mode : pathname.startsWith(m.href)
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => { if (m.mode) setMode(m.mode) }}
                className={cn(
                  'relative px-4 py-1 rounded-md text-xs font-medium transition-all',
                  active
                    ? 'text-[var(--teal-bright)] bg-[var(--teal-glow)] border border-[var(--teal-border)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {m.label}
              </Link>
            )
          })}

          {isAdvancedOrUltimate && (
            <div className="flex items-center gap-0.5 ml-3 pl-3 border-l border-[var(--border)]">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTier(t.value)}
                  title={TIER_POLICY[t.value].label}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-all',
                    activeTier === t.value
                      ? 'text-[var(--teal-bright)] bg-[var(--teal-glow)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-2 max-w-[16rem] truncate text-[10px] text-[var(--text-tertiary)]" title={TIER_POLICY[activeTier].label}>
                {TIER_POLICY[activeTier].label}
              </span>
            </div>
          )}
        </nav>

        {/* Right — jobs + credits + share + export + avatar */}
        <div className="flex items-center gap-2 shrink-0">
          <JobProgressBadge />

          {status === 'authenticated' && (
            <button
              onClick={() => setPurchaseOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--teal-glow)] border border-[var(--teal-border)] hover:bg-[rgba(0,229,200,0.18)] transition-colors"
            >
              <Hexagon className="w-3 h-3 text-[var(--teal-bright)]" />
              {creditsLoading
                ? <Loader2 className="w-3 h-3 animate-spin text-[var(--teal-bright)]" />
                : (isAdmin || unlimited)
                  ? <span className="text-[10px] font-semibold text-[var(--teal-bright)]">DEV</span>
                  : <span className={`text-[11px] font-semibold tabular-nums ${balance < 50 ? 'text-amber-400' : 'text-[var(--teal-bright)]'}`}>{balance.toLocaleString()}</span>
              }
            </button>
          )}

          <button
            type="button"
            onClick={() => useUIStore.getState().openModal('reviewPortal')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Share2 size={12} />
            Share
          </button>

          <button
            onClick={() => useUIStore.getState().openModal('export')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--teal-bright)] text-[#03080e] hover:bg-[#00f0d5] transition-colors"
          >
            <Download size={12} />
            Export Film
          </button>

          <ForgeExtremeButton />

          {status === 'authenticated' && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full ring-1 ring-[var(--border-mid)] hover:ring-[var(--teal-border)] transition-all outline-none">
                <Avatar className="w-6 h-6">
                  {user.image && (
                    <AvatarImage
                      src={user.image}
                      alt={user.name ?? ''}
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <AvatarFallback className="bg-[var(--teal-glow)] text-[var(--teal-bright)] text-[10px] font-bold">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[var(--bg-elevated)] border-[var(--border)]">
                <div className="px-3 py-2">
                  <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-[var(--border)]" />
                <DropdownMenuItem onClick={() => setPurchaseOpen(true)} className="gap-2 text-[12px] cursor-pointer text-[var(--text-secondary)]">
                  <CreditCard className="w-3.5 h-3.5" /> Buy credits
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push('/download')}
                  className="gap-2 text-[12px] cursor-pointer text-[var(--text-secondary)]"
                >
                  <Download className="w-3.5 h-3.5" /> Forge Extreme Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setActivePanel('settings')}
                  className="gap-2 text-[12px] cursor-pointer text-[var(--text-secondary)]"
                >
                  <Settings className="w-3.5 h-3.5" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[var(--border)]" />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="gap-2 text-[12px] text-red-400 cursor-pointer focus:text-red-400"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : status === 'unauthenticated' ? (
            <Link href="/login" className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Sign in</Link>
          ) : null}
        </div>
      </div>

      {/* ── ROW 2 — Film toolbar (Ultimate only, 34px) ── */}
      {isUltimate && (
        <div className="flex items-center gap-1 px-3 h-[34px] border-b border-[var(--border)] bg-[var(--bg-elevated)] overflow-x-auto">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.key}
              title={tab.label}
              onClick={() => {
                setWorkspace(tab.workspace, tab.look)
                setFilmToolbarTab(tab.id)
                const panel = FILM_TAB_TO_PANEL[tab.id]
                if (panel && (tab.workspace === 'Creator' || tab.workspace === 'Director')) setActivePanel(panel)
                else setActivePanel(null)
              }}
              className={cn(
                'shrink-0 px-2 py-1 rounded text-[11px] font-medium',
                (() => {
                  if (workspace !== tab.workspace) return false
                  if (tab.look && lookDev !== tab.look) return false
                  const twins = WORKSPACE_TABS.filter((other) => other.workspace === tab.workspace && other.look === tab.look)
                  return twins.length < 2 || filmToolbarTab === tab.id
                })()
                  ? 'bg-[var(--teal-glow)] text-[var(--teal-bright)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                tab.divider && 'ml-2 border-l border-[var(--border)] pl-2'
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-0.5">
            {(workspace === 'Editor' || workspace === 'Creator') && EDIT_TOOLS.map((tool) => (
              <button key={tool.id} type="button" title={`${tool.label} (${tool.key})`} onClick={() => activateTool(tool.id)} className="px-1 text-[10px] text-[var(--text-tertiary)]">{tool.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Edit tools sit on the film row in Ultimate. This row is only the advanced editor. */}
      {isAdvancedOrUltimate && !isUltimate && (
        <div className="flex items-center gap-1 px-3 h-[30px] border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          {/* Edit tools */}
          <div className="flex items-center gap-0.5">
          {(workspace === 'Editor' || workspace === 'Creator') && EDIT_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  title={`${tool.label} (${tool.key})`}
                  onClick={() => activateTool(tool.id)}
                  className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all',
                  editTool === tool.id
                    ? 'bg-[var(--teal-glow)] border border-[var(--teal-border)] text-[var(--teal-bright)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {tool.icon}
                <span className="hidden sm:inline">{tool.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-[var(--border)] mx-1.5" />

          {/* Undo/Redo */}
          <button type="button" title="Undo (Cmd+Z)" onClick={() => usePlaybackStore.getState().undo()} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            <Undo2 size={12} />
          </button>
          <button type="button" title="Redo (Cmd+Shift+Z)" onClick={() => usePlaybackStore.getState().redo()} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            <Redo2 size={12} />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-1.5" />

          {/* Zoom */}
          <button onClick={() => setZoom(1)} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors" title="Fit">
            <Maximize2 size={12} />
          </button>
          <button onClick={() => setZoom(Math.max(0.1, zoom - 0.25))} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            <ZoomOut size={12} />
          </button>
          <span className="text-[10px] text-[var(--text-tertiary)] w-8 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(10, zoom + 0.25))} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            <ZoomIn size={12} />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-1.5" />

          {/* Auto-save indicator */}
          <div className="flex items-center gap-1 ml-auto">
            {autoSaveStatus === 'saving' && <Loader2 size={10} className="animate-spin text-[var(--text-tertiary)]" />}
            {autoSaveStatus === 'saved' && <Save size={10} className="text-[var(--success)]" />}
            {autoSaveStatus === 'unsaved' && <AlertCircle size={10} className="text-[var(--warning)]" />}
            <span className="text-[9px] text-[var(--text-tertiary)]">
              {autoSaveStatus === 'saving' ? 'Saving…' : autoSaveStatus === 'saved' ? 'Saved' : 'Unsaved'}
            </span>
          </div>
        </div>
      )}

      <CreditPurchaseModal open={purchaseOpen} onOpenChange={setPurchaseOpen} />
    </>
  )
}
