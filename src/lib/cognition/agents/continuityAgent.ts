// Continuity Agent — structured scene-to-scene state (working memory): wardrobe,
// props, character state, and environment persist across cuts so "MAYA puts on a
// red jacket in scene 1" survives into every later scene.

import { callAgentLLM, parseAgentJSON, type CognitiveAgent } from './base'

export interface ContinuityState {
  characters: Record<string, {
    wardrobe: string[]
    state: string
    position?: string
  }>
  props: string[]
  environment: {
    timeOfDay: string
    weather: string
    lighting: string
  }
}

export interface ContinuityInput {
  shotPrompt: string
  prior: ContinuityState | null
}

const EMPTY: ContinuityState = {
  characters: {},
  props: [],
  environment: { timeOfDay: '', weather: '', lighting: '' },
}

const SYSTEM = `Track film continuity state. Update the prior state with anything new this shot establishes.
Use the subject name written in the shot. Do not rename them and do not invent a character.
Return ONLY JSON.`

export const continuityAgent: CognitiveAgent<ContinuityInput, ContinuityState> = {
  name: 'continuity',
  fallback: input => input.prior ?? EMPTY,
  async execute({ shotPrompt, prior }) {
    const text = await callAgentLLM({
      system: SYSTEM,
      source: 'cognitive.continuity',
      maxTokens: 500,
      fast: true,
      user: `Prior continuity: ${JSON.stringify(prior ?? {})}
This shot: "${shotPrompt}"

Return updated ContinuityState JSON:
{ "characters": { "NAME": { "wardrobe": [], "state": "", "position": "" } },
  "props": [], "environment": { "timeOfDay": "", "weather": "", "lighting": "" } }`,
    })
    return parseAgentJSON<ContinuityState>(text, prior ?? EMPTY)
  },
}

// Inject continuity into a shot prompt so the model keeps state consistent.
export function applyContinuity(prompt: string, state: ContinuityState): string {
  const wardrobe = Object.entries(state?.characters ?? {})
    .map(([name, c]) => {
      const items = Array.isArray(c?.wardrobe) ? c.wardrobe.filter(Boolean) : []
      const worn = items.length ? ` wearing ${items.join(', ')}` : ''
      const st = c?.state ? `, ${c.state}` : ''
      return `${name}${worn}${st}`
    })
    .filter(Boolean)
    .join('; ')
  const setting = state?.environment
  const env = `${setting?.timeOfDay ?? ''} ${setting?.weather ?? ''} ${setting?.lighting ?? ''}`.trim()
  return `${prompt}${wardrobe ? ` [Continuity: ${wardrobe}]` : ''}${env ? ` [Setting: ${env}]` : ''}`
}
