export type VoiceModelChoice = 'eleven_v3' | 'flash'

export interface VoiceParams {
  model: VoiceModelChoice
  emotion: number
  stability: number
  similarity: number
  style: number
  speed: number
}

export interface DialogueLine {
  lineId: string
  text: string
  characterId?: string
  voiceId?: string
  params: VoiceParams
  takeMediaId?: string
  takes?: string[]
  lipSync?: boolean
}

export const DEFAULT_VOICE_PARAMS: VoiceParams = {
  model: 'eleven_v3',
  emotion: 0.5,
  stability: 0.5,
  similarity: 0.75,
  style: 0,
  speed: 1,
}

export function emptyDialogueLine(lineId = 'line-1'): DialogueLine {
  return { lineId, text: '', params: { ...DEFAULT_VOICE_PARAMS }, takes: [], lipSync: false }
}

export function readDialogue(value: unknown): DialogueLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Partial<DialogueLine>
    const params = row.params ?? DEFAULT_VOICE_PARAMS
    return [{
      lineId: typeof row.lineId === 'string' && row.lineId ? row.lineId : 'line-1',
      text: typeof row.text === 'string' ? row.text : '',
      characterId: typeof row.characterId === 'string' ? row.characterId : undefined,
      voiceId: typeof row.voiceId === 'string' ? row.voiceId : undefined,
      params: {
        model: params.model === 'flash' ? 'flash' : 'eleven_v3',
        emotion: numberOr(params.emotion, 0.5),
        stability: numberOr(params.stability, 0.5),
        similarity: numberOr(params.similarity, 0.75),
        style: numberOr(params.style, 0),
        speed: numberOr(params.speed, 1),
      },
      takeMediaId: typeof row.takeMediaId === 'string' ? row.takeMediaId : undefined,
      takes: Array.isArray(row.takes) ? row.takes.filter((id): id is string => typeof id === 'string') : [],
      lipSync: row.lipSync === true,
    }]
  })
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Selecting a take references it. Earlier takes stay on the line. */
export function selectVoiceTake(lines: DialogueLine[], lineId: string, mediaId: string): DialogueLine[] {
  return lines.map((line) => {
    if (line.lineId !== lineId) return line
    const takes = line.takes ?? []
    return {
      ...line,
      takeMediaId: mediaId,
      takes: takes.includes(mediaId) ? takes : [...takes, mediaId],
    }
  })
}
