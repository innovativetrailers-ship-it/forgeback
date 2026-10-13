import { logCaught } from '@/lib/diagnostics/caught'
import { runModel1 } from './model1'
import { callCouncil } from './council'
import { db } from '../db'
import type { ZodSchema } from 'zod'

export interface AgenticLoopConfig {
  maxIterations: number
  qualityThreshold: number
  taskType: 'routing' | 'creative' | 'analysis' | 'film_direction'
}

export async function runAgenticLoop<T>(params: {
  task: string
  initialContext: string
  schema: ZodSchema<T>
  config: AgenticLoopConfig
  userId?: string
}): Promise<{ result: T; iterations: number; chainOfThought: string[] }> {
  const { task, initialContext, schema, config, userId } = params
  const chainOfThought: string[] = []

  let lastOutput = ''
  let iterations = 0
  let result: T | null = null

  for (let i = 0; i < config.maxIterations; i++) {
    iterations = i + 1

    if (i === 0) {
      // ITERATION 1 — PLAN
      const planPrompt = `Task: ${task}

Context: ${initialContext}

First, plan your approach step by step, then produce your output.`

      const planResult = await runModel1({
        systemPrompt: `You are the AI Brain of CINÉMA. ${
          config.taskType === 'creative' ? 'Think creatively and cinematically.' :
          config.taskType === 'routing' ? 'Analyse requirements precisely.' :
          config.taskType === 'analysis' ? 'Analyse systematically.' :
          'Think like a master film director.'
        }`,
        userMessage: planPrompt,
        requireJSON: true,
      })

      lastOutput = planResult.content
      chainOfThought.push(`PLAN: ${planResult.content}`)

      try {
        result = schema.parse(JSON.parse(lastOutput))
      } catch (err) {
        console.warn("[caught] src/lib/brain/agentic-loop.ts:54", err instanceof Error ? { name: err.name, message: err.message } : err)

        // Continue to critique
      }
    } else if (i === 1 && result !== null) {
      // ITERATION 2 — CRITIQUE
      const critiquePrompt = `Previous output:
${lastOutput}

You are a harsh critic. Identify every flaw in this output. Score it 0-10. If score >= ${Math.round(config.qualityThreshold * 10)}, output ONLY the word ACCEPT. Otherwise list specific flaws.`

      const critiqueResult = await runModel1({
        systemPrompt: 'You are a harsh quality critic. Be specific about flaws.',
        userMessage: critiquePrompt,
      })

      chainOfThought.push(`CRITIQUE: ${critiqueResult.content}`)

      if (critiqueResult.content.includes('ACCEPT') || critiqueResult.content.includes('9') || critiqueResult.content.includes('10')) {
        break // Quality gate passed
      }
    } else if (i === 2) {
      // ITERATION 3 — REVISE
      const revisePrompt = `Original task: ${task}
Context: ${initialContext}

Previous attempt:
${lastOutput}

Critique:
${chainOfThought[chainOfThought.length - 1]}

Produce a revised, improved output addressing every critique point.`

      const reviseResult = await runModel1({
        systemPrompt: `You are the AI Brain of CINÉMA. Revise and improve.`,
        userMessage: revisePrompt,
        requireJSON: true,
      })

      lastOutput = reviseResult.content
      chainOfThought.push(`REVISE: ${reviseResult.content}`)

      try {
        result = schema.parse(JSON.parse(lastOutput))
      } catch (err) {
        console.warn("[caught] src/lib/brain/agentic-loop.ts:98", err instanceof Error ? { name: err.name, message: err.message } : err)

        // Use last successful result or fallback to council
      }
      break
    }
  }

  // Fallback to Council if model1 failed
  if (result === null) {
    const councilResult = await callCouncil({
      task,
      messages: [{ role: 'user', content: `${task}\n\nContext: ${initialContext}` }],
      requireJSON: true,
      reason: 'Model1 agentic loop failed to produce valid output',
    })

    chainOfThought.push(`COUNCIL_FALLBACK: ${councilResult.content}`)

    try {
      result = schema.parse(JSON.parse(councilResult.content))
    } catch {
      throw new Error(`Agentic loop failed to produce valid output after ${iterations} iterations and Council fallback`)
    }
  }

  // Log chain of thought to TrainingData if userId provided
  if (userId) {
    db.trainingData.create({
      data: {
        userId,
        type: 'council_distillation',
        instruction: task,
        metadata: {
          taskType: config.taskType,
          iterations,
          chainOfThought,
          configMaxIterations: config.maxIterations,
          qualityThreshold: config.qualityThreshold,
        },
        isProcessed: false,
      },
    }).catch((err) => logCaught('lib/brain/agentic-loop', err)) // Non-blocking
  }

  return { result, iterations, chainOfThought }
}
