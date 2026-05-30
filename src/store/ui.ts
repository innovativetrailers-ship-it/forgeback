import { create } from 'zustand'
import { nanoid } from 'nanoid'

// ─── Panel / Tool / Right-Panel types ─────────────────────────────────────────

export type PanelId =
  | 'generate' | 'vault' | 'library' | 'location' | 'cast'
  | 'makeup' | 'sfx_makeup' | 'greenscreen' | 'cgi' | 'vfx' | 'transitions'
  | 'audio' | 'stock' | 'script' | 'storyboard' | 'avatar'
  | 'translate' | 'highlight' | 'highlights' | 'brandkit' | 'brand_kit' | 'settings'
  | 'ai_director' | 'continuity' | 'audio_mix'
  | 'transcript' | 'multicam' | 'plugin' | 'camera_ingest' | 'review'
  | 'particle' | 'performance'

export type ToolId =
  | 'select' | 'razor' | 'repaint' | 'text' | 'motion_brush'
  | 'track' | 'hand' | 'zoom'
  | 'crop' | 'morph_cut' | 'stabilise' | 'retime' | 'extend'

/** @deprecated use ToolId */
export type EditTool = 'select' | 'razor' | 'repaint' | 'motion_brush' | 'text'

export type RightPanelId =
  | 'properties' | 'colour' | 'audio' | 'vfx' | 'cgi'
  | 'director' | 'upscale' | 'makeup' | 'greenscreen'
  | 'lighting' | 'effects' | 'transform'
  | 'transcript' | 'stabilise' | 'retime' | 'planar_track'
  | 'object_removal' | 'emotion' | 'spatial' | 'shoppable'

export type FilmToolbarTab =
  | 'script' | 'storyboard' | 'director' | 'ai_director' | 'continuity'
  | 'cast' | 'locations' | 'colour' | 'vfx_mix' | 'audio_mix'
  | 'greenscreen' | 'sfx_makeup' | 'cgi'
  | 'multicam' | 'transcript' | 'export_hub' | 'collab_grade' | 'plugin' | 'review'

export type SimpleModeTab =
  | 'text_to_video' | 'image_to_video' | 'audio_to_video'
  | 'auto_social' | 'avatar_video' | 'translate' | 'highlights'
  | 'slides_to_video'

export type EditorMode = 'simple' | 'advanced' | 'ultimate'

export type ModalId =
  | 'characterOnboarding' | 'repaint' | 'recast' | 'export'
  | 'timelineEdit' | 'reviewPortal' | 'brandKitEditor' | 'purchase'
  | 'aiDirector' | 'continuity' | 'colourGrade' | 'audioMixer'
  | 'vfxCompositor' | 'cgiInsertion' | 'loraTraining' | 'credit_purchase'
  | 'import_project'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

// ─── Store interface ───────────────────────────────────────────────────────────

interface UIState {
  activePanel: PanelId | null
  activeTool: ToolId
  /** @deprecated use activeTool */
  editTool: EditTool
  activeRightPanel: RightPanelId
  activeFilmTab: FilmToolbarTab | null
  /** @deprecated use activeFilmTab */
  filmToolbarTab: FilmToolbarTab | null
  editorMode: EditorMode
  activeModal: ModalId | null
  modalPayload: Record<string, unknown>
  isCreditModalOpen: boolean
  isCharacterOnboardingOpen: boolean
  toasts: Toast[]
  projectName: string
  snapEnabled: boolean
  rippleEnabled: boolean
  linkedEditing: boolean
  autoSaveStatus: 'saved' | 'saving' | 'unsaved'

  // Panel
  setActivePanel: (panel: PanelId | null) => void
  togglePanel: (panel: PanelId) => void

  // Tool
  setActiveTool: (tool: ToolId) => void
  /** @deprecated use setActiveTool */
  setEditTool: (tool: EditTool) => void

  // Right panel
  setActiveRightPanel: (panel: RightPanelId) => void

  // Film toolbar
  setActiveFilmTab: (tab: FilmToolbarTab | null) => void
  /** @deprecated use setActiveFilmTab */
  setFilmToolbarTab: (tab: FilmToolbarTab | null) => void

  // Mode
  setEditorMode: (mode: EditorMode) => void

  // Modal (generic)
  openModal: (modal: ModalId, payload?: Record<string, unknown>) => void
  closeModal: () => void

  // Credit modal shortcut
  openCreditModal: () => void
  closeCreditModal: () => void

  // Character onboarding shortcut
  openCharacterOnboarding: () => void
  closeCharacterOnboarding: () => void

  // Toasts
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void

  // Misc editor prefs
  setProjectName: (name: string) => void
  setSnapEnabled: (v: boolean) => void
  setRippleEnabled: (v: boolean) => void
  setLinkedEditing: (v: boolean) => void
  setAutoSaveStatus: (s: 'saved' | 'saving' | 'unsaved') => void
}

// ─── Store implementation ──────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set, get) => ({
  activePanel: 'generate',
  activeTool: 'select',
  editTool: 'select',
  activeRightPanel: 'properties',
  activeFilmTab: null,
  filmToolbarTab: null,
  editorMode: 'advanced',
  activeModal: null,
  modalPayload: {},
  isCreditModalOpen: false,
  isCharacterOnboardingOpen: false,
  toasts: [],
  projectName: 'Untitled project',
  snapEnabled: true,
  rippleEnabled: false,
  linkedEditing: true,
  autoSaveStatus: 'saved',

  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) => set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),

  setActiveTool: (tool) => set({ activeTool: tool, editTool: tool as EditTool }),
  setEditTool: (tool) => set({ editTool: tool, activeTool: tool as ToolId }),

  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),

  setActiveFilmTab: (tab) => set({ activeFilmTab: tab, filmToolbarTab: tab }),
  setFilmToolbarTab: (tab) => set({ filmToolbarTab: tab, activeFilmTab: tab }),

  setEditorMode: (editorMode) => set({ editorMode }),

  openModal: (modal, payload = {}) => {
    set({ activeModal: modal, modalPayload: payload })
    if (modal === 'credit_purchase') set({ isCreditModalOpen: true })
    if (modal === 'characterOnboarding') set({ isCharacterOnboardingOpen: true })
  },
  closeModal: () => set({ activeModal: null, modalPayload: {}, isCreditModalOpen: false, isCharacterOnboardingOpen: false }),

  openCreditModal: () => set({ isCreditModalOpen: true, activeModal: 'credit_purchase' }),
  closeCreditModal: () => set({ isCreditModalOpen: false, activeModal: null }),

  openCharacterOnboarding: () => set({ isCharacterOnboardingOpen: true, activeModal: 'characterOnboarding' }),
  closeCharacterOnboarding: () => set({ isCharacterOnboardingOpen: false, activeModal: null }),

  addToast: (message, type = 'info') => {
    const id = nanoid(6)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().removeToast(id), 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setProjectName: (projectName) => set({ projectName }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setRippleEnabled: (rippleEnabled) => set({ rippleEnabled }),
  setLinkedEditing: (linkedEditing) => set({ linkedEditing }),
  setAutoSaveStatus: (autoSaveStatus) => set({ autoSaveStatus }),
}))
