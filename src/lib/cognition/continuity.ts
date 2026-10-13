import { continuityAgent, type ContinuityState } from './agents/continuityAgent'
import { cognitionEnabled } from './flag'
import { getWorkingState, setWorkingState } from './memory/working'
import { runAgent } from './runtime'

const EMPTY: ContinuityState = {
  characters: {},
  props: [],
  environment: { timeOfDay: '', weather: '', lighting: '' },
}

/** Update working memory for this project, then composeShotPrompt can read wardrobe and props. */
export async function rememberContinuity(projectId: string, shotPrompt: string): Promise<void> {
  const key = `project:${projectId}`
  const prior = await getWorkingState<ContinuityState>(key)
  if (!cognitionEnabled()) return
  const result = await runAgent({
    name: 'continuity',
    timeoutMs: 20_000,
    run: () => continuityAgent.execute({ shotPrompt, prior }),
    fallback: prior ?? EMPTY,
  })
  await setWorkingState(key, result.value)
}
