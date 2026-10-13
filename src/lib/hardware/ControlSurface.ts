'use client'

/**
 * Hardware control surface support.
 * WebMIDI API for USB/DIN MIDI surfaces (Behringer BCF2000, JLCooper MCS-Panner, etc.)
 * OSC (Open Sound Control) via WebSocket proxy for network-connected panels (TouchOSC, Lemur).
 */

export type ColourParam =
  | 'lift_red' | 'lift_green' | 'lift_blue'
  | 'gamma_red' | 'gamma_green' | 'gamma_blue'
  | 'gain_red' | 'gain_green' | 'gain_blue'
  | 'saturation' | 'contrast' | 'exposure'
  | 'temperature' | 'tint' | 'hue'

export interface MIDIMapping {
  cc: number
  param: ColourParam
  channel?: number   // MIDI channel 0-15, undefined = any
}

export type ColourGradeUpdateCallback = (param: ColourParam, value: number) => void

// Default CC map — Behringer BCF2000 / JLCooper layout compatible
const DEFAULT_CC_MAP: Record<number, ColourParam> = {
  1:  'lift_red',    2:  'lift_green',    3:  'lift_blue',
  4:  'gamma_red',   5:  'gamma_green',   6:  'gamma_blue',
  7:  'gain_red',    8:  'gain_green',    9:  'gain_blue',
  10: 'saturation',  11: 'contrast',      12: 'exposure',
  13: 'temperature', 14: 'tint',          15: 'hue',
}

let midiAccess: MIDIAccess | null = null
let ccMap: Record<number, ColourParam> = { ...DEFAULT_CC_MAP }
let gradeCallback: ColourGradeUpdateCallback | null = null
let oscSocket: WebSocket | null = null

// ── MIDI ─────────────────────────────────────────────────────────────────────

export async function initMIDIControlSurface(
  onUpdate: ColourGradeUpdateCallback,
  customMappings?: MIDIMapping[]
): Promise<{ devices: string[] }> {
  gradeCallback = onUpdate

  if (customMappings) {
    ccMap = {}
    for (const m of customMappings) {
      ccMap[m.cc] = m.param
    }
  }

  if (!navigator.requestMIDIAccess) {
    console.warn('WebMIDI API not available in this browser')
    return { devices: [] }
  }

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false })
    const devices: string[] = []

    midiAccess.inputs.forEach(input => {
      input.onmidimessage = handleMIDIMessage
      devices.push(input.name ?? `Device ${input.id}`)
    })

    // Listen for new devices plugged in
    midiAccess.onstatechange = (e) => {
      const port = e.port
      if (!port) return
      if (port.type === 'input' && port.state === 'connected') {
        ;(port as MIDIInput).onmidimessage = handleMIDIMessage
      }
    }

    return { devices }
  } catch (err) {
    console.warn('MIDI access denied:', err)
    return { devices: [] }
  }
}

function handleMIDIMessage(event: MIDIMessageEvent): void {
  if (!event.data || event.data.length < 3) return

  const [status, cc, value] = event.data
  const messageType = status & 0xf0

  // Control Change (0xB0)
  if (messageType !== 0xb0) return

  const normalised = value / 127  // 0–1
  const param = ccMap[cc]
  if (param && gradeCallback) {
    gradeCallback(param, normalised)
  }
}

export function getConnectedMIDIDevices(): string[] {
  if (!midiAccess) return []
  const devices: string[] = []
  midiAccess.inputs.forEach(input => {
    devices.push(input.name ?? `Device ${input.id}`)
  })
  return devices
}

export function updateCCMapping(mappings: MIDIMapping[]): void {
  ccMap = {}
  for (const m of mappings) {
    ccMap[m.cc] = m.param
  }
}

export function resetCCMappings(): void {
  ccMap = { ...DEFAULT_CC_MAP }
}

export function disposeMIDI(): void {
  if (midiAccess) {
    midiAccess.inputs.forEach(input => {
      input.onmidimessage = null
    })
  }
  midiAccess = null
  gradeCallback = null
}

// ── OSC via WebSocket proxy ───────────────────────────────────────────────────

// OSC messages arrive via a WebSocket bridge (the Next.js server proxies them)
// OSC path format: /colour/<param> with float value 0-1
// e.g. /colour/lift/r → lift_red, /colour/gamma/g → gamma_green

const OSC_PATH_MAP: Record<string, ColourParam> = {
  '/colour/lift/r':    'lift_red',
  '/colour/lift/g':   'lift_green',
  '/colour/lift/b':   'lift_blue',
  '/colour/gamma/r':  'gamma_red',
  '/colour/gamma/g':  'gamma_green',
  '/colour/gamma/b':  'gamma_blue',
  '/colour/gain/r':   'gain_red',
  '/colour/gain/g':   'gain_green',
  '/colour/gain/b':   'gain_blue',
  '/colour/sat':      'saturation',
  '/colour/contrast': 'contrast',
  '/colour/exposure': 'exposure',
  '/colour/temp':     'temperature',
  '/colour/tint':     'tint',
  '/colour/hue':      'hue',
}

export function initOSCControlSurface(
  onUpdate: ColourGradeUpdateCallback,
  wsUrl = '/api/hardware/osc-proxy'
): void {
  gradeCallback = onUpdate

  if (oscSocket && oscSocket.readyState === WebSocket.OPEN) {
    oscSocket.close()
  }

  oscSocket = new WebSocket(wsUrl.startsWith('ws') ? wsUrl : `ws://${window.location.host}${wsUrl}`)

  oscSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { path: string; args: number[] }
      const param = OSC_PATH_MAP[msg.path]
      if (param && msg.args?.[0] !== undefined && gradeCallback) {
        gradeCallback(param, Math.max(0, Math.min(1, msg.args[0])))
      }
    } catch (err) {
      console.warn("[caught] src/lib/hardware/ControlSurface.ts:172", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore malformed messages */ }
  }

  oscSocket.onerror = () => console.warn('OSC WebSocket error')
  oscSocket.onclose = () => console.info('OSC WebSocket closed')
}

export function disposeOSC(): void {
  if (oscSocket) {
    oscSocket.close()
    oscSocket = null
  }
}

export function getDefaultCCMap(): Record<number, ColourParam> {
  return { ...DEFAULT_CC_MAP }
}
