export interface MusicRequest {
  prompt: string
  style?: string
  lyrics?: string
  instrumental: boolean
  targetSeconds: number
  source: string
}

export interface MusicResult {
  url: string
  provider: 'suno' | 'elevenlabs'
}

export interface MusicProvider {
  id: 'suno' | 'elevenlabs'
  generate(req: MusicRequest): Promise<MusicResult>
  extend?(audioUrl: string, addSeconds: number, style: string): Promise<MusicResult>
}
