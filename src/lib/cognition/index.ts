// Public surface for the cognitive backend.

export { runCognitiveDirector as think, type CreativeBrief } from './director'
export { runLearningLoop as learn, type RenderResult } from './learn'
export { recallEpisodes as recall } from './memory/episodic'
export { getAgentHealth } from './runtime'
export { seedKnowledgeGraph } from './routing/knowledgeGraph'

// One-time seeding — call on deploy.
export async function seedAll(): Promise<void> {
  const { seedKnowledgeGraph } = await import('./routing/knowledgeGraph')
  await seedKnowledgeGraph()
  console.log('[cognition] knowledge graph seeded')
}
