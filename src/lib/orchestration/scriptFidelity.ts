import { capPromptText } from '@cinema/core'
import type { StructuredShot } from './types'

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto', 'over', 'under',
  'through', 'about', 'after', 'before', 'main', 'character', 'characters', 'scene',
  'shot', 'close', 'film', 'video', 'style', 'notes', 'directorial', 'their', 'they',
  'them', 'then', 'than', 'when', 'where', 'what', 'who', 'whose', 'which', 'while',
  'have', 'has', 'had', 'was', 'were', 'are', 'been', 'being', 'into',
])

/** Content words the shot must still be about. */
export function coreTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []
  return [...new Set(words.filter((word) => word.length >= 3 && !STOP.has(word)))]
}

export function splitScriptScenes(script: string): string[] {
  const text = script.trim()
  if (!text) return []
  const headed = text.split(/\n(?=(?:scene|int\.|ext\.)\b)/i).map((part) => part.trim()).filter(Boolean)
  if (headed.length > 1) return headed
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length > 20)
  if (paragraphs.length > 1) return paragraphs
  return [text]
}

export function sceneForShot(scenes: string[], shotIndex: number, sceneNumber?: number): string {
  if (!scenes.length) return ''
  if (scenes.length === 1) return scenes[0]
  if (sceneNumber != null && sceneNumber >= 1 && scenes[sceneNumber - 1]) return scenes[sceneNumber - 1]
  return scenes[Math.min(Math.max(shotIndex, 0), scenes.length - 1)]
}

function mentions(hay: string, term: string): boolean {
  if (hay.includes(term)) return true
  const stem = term.replace(/(es|s)$/, '')
  return stem.length >= 4 && hay.includes(stem)
}

/** True when the shot still shares a subject, action, or setting word with the scene. */
export function shotHonorsScene(prompt: string, scene: string): boolean {
  const terms = coreTerms(scene)
  if (!terms.length) return true
  const hay = prompt.toLowerCase()
  return terms.some((term) => mentions(hay, term))
}

/** Replace a drifted shot with the user's scene. The invented action is not kept. */
export function groundShotPrompt(visualPrompt: string, sceneText: string): string {
  const scene = sceneText.trim()
  if (!scene) return visualPrompt.trim()
  if (shotHonorsScene(visualPrompt, scene)) return visualPrompt.trim()
  return capPromptText(scene, 1500)
}

function bindingScript(script: string): string {
  const lines = script.split('\n').filter((line) => {
    const text = line.trim()
    if (!text) return true
    return !/^style:/i.test(text) && !/^directorial notes:/i.test(text)
  })
  const text = lines.join('\n').trim()
  return text || script.trim()
}

export function enforceScriptFidelity(shots: StructuredShot[], script: string): StructuredShot[] {
  const scenes = splitScriptScenes(bindingScript(script))
  return shots.map((shot, index) => {
    const scene = sceneForShot(scenes, shot.shotIndex ?? index, shot.sceneNumber)
    const before = shot.visualPrompt ?? ''
    const honors = shotHonorsScene(before, scene)
    const visualPrompt = honors ? before : groundShotPrompt(before, scene)
    const shotNo = shot.shotIndex ?? index
    if (shotNo < 3) {
      console.log('[director] shot prompt', {
        shot: shotNo,
        scene: scene.slice(0, 240),
        prompt: visualPrompt.slice(0, 240),
      })
    }
    if (!honors) {
      console.warn('[director] script_drift', {
        shot: shotNo,
        scene: scene.slice(0, 240),
        before: before.slice(0, 240),
        after: visualPrompt.slice(0, 240),
      })
    }
    return visualPrompt === before ? shot : { ...shot, visualPrompt }
  })
}
