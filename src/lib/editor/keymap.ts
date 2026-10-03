export const KEY_COMMANDS = [
  'play', 'shuttleBack', 'pause', 'shuttleForward', 'markIn', 'markOut',
  'insert', 'overwrite', 'replace', 'append', 'rippleDelete', 'blade',
  'select', 'undo', 'redo', 'split', 'duplicate',
  'trackSelectForward', 'trackSelectBack', 'ripple', 'rolling', 'rateStretch',
  'razor', 'slip', 'slide', 'pen', 'hand', 'zoom', 'addEdit', 'match', 'snap',
  'placeOnTop', 'trim', 'dynamicTrim', 'pasteAttributes',
] as const
export type KeyCommand = (typeof KEY_COMMANDS)[number]

export type Keymap = Record<string, KeyCommand>

export const KEYMAP_PRESETS: Record<'Premiere' | 'Resolve' | 'Final Cut' | 'Forge', Keymap> = {
  Premiere: {
    v: 'select', a: 'trackSelectForward', 'shift+a': 'trackSelectBack',
    b: 'ripple', n: 'rolling', r: 'rateStretch', c: 'razor', y: 'slip', u: 'slide',
    p: 'pen', h: 'hand', z: 'zoom', ',': 'insert', '.': 'overwrite',
    'mod+k': 'addEdit', 'shift+backspace': 'rippleDelete', f: 'match', s: 'snap',
    ' ': 'play', j: 'shuttleBack', k: 'pause', l: 'shuttleForward', i: 'markIn', o: 'markOut',
  },
  Resolve: {
    f9: 'insert', f10: 'overwrite', f11: 'replace', f12: 'placeOnTop', 'shift+f12': 'append',
    a: 'select', b: 'blade', 'mod+\\': 'split', t: 'trim', w: 'dynamicTrim',
    'shift+backspace': 'rippleDelete', n: 'snap', f: 'match', 'alt+v': 'pasteAttributes',
    ' ': 'play', j: 'shuttleBack', k: 'pause', l: 'shuttleForward', i: 'markIn', o: 'markOut',
  },
  'Final Cut': {
    ' ': 'play', j: 'shuttleBack', k: 'pause', l: 'shuttleForward',
    i: 'markIn', o: 'markOut', w: 'insert', d: 'overwrite',
    b: 'blade', a: 'select', 'shift+backspace': 'rippleDelete', s: 'snap',
  },
  Forge: {
    ' ': 'play', j: 'shuttleBack', k: 'pause', l: 'shuttleForward',
    i: 'markIn', o: 'markOut', e: 'insert', w: 'overwrite',
    b: 'blade', v: 'select', 'shift+backspace': 'rippleDelete', d: 'duplicate', s: 'snap',
  },
}

export function chordFromEvent(event: { key: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): string {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && key !== ' ') parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

export function commandFor(map: Keymap, event: { key: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): KeyCommand | null {
  return map[chordFromEvent(event)] ?? null
}

export function exportKeymap(map: Keymap): string {
  return JSON.stringify(map)
}

export function importKeymap(raw: string): Keymap | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    const next: Keymap = {}
    for (const [key, command] of Object.entries(parsed)) {
      if ((KEY_COMMANDS as readonly string[]).includes(command)) next[key] = command as KeyCommand
    }
    return next
  } catch (err) {
    console.warn('[keymap]', err instanceof Error ? err.message : err)
    return null
  }
}
