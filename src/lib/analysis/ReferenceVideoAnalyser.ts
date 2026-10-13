import { runModel1 } from '../brain/model1'
import { runFal } from '../fal/client'

export interface VideoStyleDNA {
  cinematography: {
    dominantShotTypes: string[]
    cameraMovements: string[]
    averageShotDuration: number
    depthOfField: string
    lensCharacter: string
  }
  colourGrade: {
    dominantPalette: string[]
    temperature: string
    contrast: string
    saturation: string
    filmEmulation?: string
    shadows: string
    highlights: string
  }
  editingStyle: {
    cuttingPattern: string
    averageCutFrequency: number
    transitionTypes: string[]
    pacing: string
    matchCuts: boolean
  }
  narrative: {
    structure: string
    tone: string
    themes: string[]
    storyBeats: string[]
    openingHook: string
    closingStyle: string
  }
  audioProfile: {
    musicStyle: string
    musicPlacement: string
    dialogueStyle: string
    sfxDensity: string
    silencePlacement: string
  }
  productionDesign: {
    settingTypes: string[]
    timeperiod: string
    textureAndMaterials: string
    lightingSources: string[]
  }
  creativeBrief: string
  influencedBy: string[]
  replicationPrompts: ReplicationPrompts
}

export interface ReplicationPrompts {
  cinematographyPrompt: string
  colourGradeInstruction: string
  editingInstructions: string
  audioPrompt: string
  overallStyleGuide: string
}

export class ReferenceVideoAnalyser {

  async analyseReference(params: {
    videoUrl: string
    analysisDepth: 'quick' | 'standard' | 'deep'
    extractScriptElements?: boolean
  }): Promise<VideoStyleDNA> {
    const sampleTimestamps = params.analysisDepth === 'quick' ? [0.1, 0.5, 0.9]
      : params.analysisDepth === 'standard' ? [0.1, 0.25, 0.5, 0.75, 0.9]
      : [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]

    const { extractVideoFrame } = await import('@/lib/fal/frameExtract')
    const frames = await Promise.all(
      sampleTimestamps.map((ts) => extractVideoFrame(params.videoUrl, { timestamp: ts })),
    )

    const visualAnalysis = await runModel1({
      systemPrompt: `You are a professional cinematographer and film analyst. Analyse these frames from a reference video and extract the complete visual style DNA.

Be specific and technical. Avoid vague descriptions. Your analysis will be used to:
1. Guide generation model prompts to match this style
2. Configure colour grading settings
3. Inform editing rhythm and shot selection

Return ONLY this JSON structure:
{
  "cinematography": {
    "dominantShotTypes": [],
    "cameraMovements": [],
    "averageShotDuration": 0,
    "depthOfField": "",
    "lensCharacter": ""
  },
  "colourGrade": {
    "dominantPalette": ["#hex"],
    "temperature": "",
    "contrast": "",
    "saturation": "",
    "filmEmulation": "",
    "shadows": "",
    "highlights": ""
  },
  "editingStyle": {
    "cuttingPattern": "",
    "averageCutFrequency": 0,
    "transitionTypes": [],
    "pacing": "",
    "matchCuts": false
  },
  "narrative": {
    "structure": "",
    "tone": "",
    "themes": [],
    "storyBeats": [],
    "openingHook": "",
    "closingStyle": ""
  },
  "audioProfile": {
    "musicStyle": "",
    "musicPlacement": "",
    "dialogueStyle": "",
    "sfxDensity": "",
    "silencePlacement": ""
  },
  "productionDesign": {
    "settingTypes": [],
    "timeperiod": "",
    "textureAndMaterials": "",
    "lightingSources": []
  },
  "influencedBy": []
}`,
      userMessage: 'Analyse these video frames for complete style DNA extraction.',
      images: frames,
      requireJSON: true,
      useAgenticLoop: params.analysisDepth === 'deep',
    })

    const analysis = JSON.parse(visualAnalysis.content)

    const synthesisResponse = await runModel1({
      systemPrompt: `You are a creative director. Based on this style analysis, write:
1. A one-paragraph creative brief capturing the essence of this visual language
2. Injection prompts for an AI generation system to replicate this style

Return JSON: {
  "creativeBrief": "string",
  "replicationPrompts": {
    "cinematographyPrompt": "string for injecting into video generation prompts",
    "colourGradeInstruction": "string for post-processing configuration",
    "editingInstructions": "string for timeline assembly",
    "audioPrompt": "string for music and foley generation",
    "overallStyleGuide": "comprehensive style injection string"
  }
}`,
      userMessage: `Style analysis: ${JSON.stringify(analysis)}`,
      requireJSON: true,
    })

    const synthesis = JSON.parse(synthesisResponse.content)

    return {
      ...analysis,
      creativeBrief: synthesis.creativeBrief,
      replicationPrompts: synthesis.replicationPrompts,
    }
  }

  async generateScriptFromReference(params: {
    referenceVideoUrl: string
    newConcept: string
    format: 'feature_film' | 'short_film' | 'episode' | 'social'
    targetRuntime: number
  }): Promise<string> {
    const styleDNA = await this.analyseReference({
      videoUrl: params.referenceVideoUrl,
      analysisDepth: 'standard',
      extractScriptElements: true,
    })

    const scriptResponse = await runModel1({
      systemPrompt: `You are a screenwriter. Write a ${params.format} screenplay inspired by the reference style.
Adopt the narrative structure, tone, and storytelling approach of the reference.
Reference style: ${styleDNA.creativeBrief}
Narrative structure: ${styleDNA.narrative.structure}
Tone: ${styleDNA.narrative.tone}
Themes drawn from reference: ${styleDNA.narrative.themes.join(', ')}

Write in Fountain screenplay format. Target runtime: ${params.targetRuntime} minutes.`,
      userMessage: `New concept: ${params.newConcept}`,
      requireJSON: false,
      useAgenticLoop: true,
    })

    return scriptResponse.content
  }

  applyStyleDNAToShotList(shots: Record<string, unknown>[], styleDNA: VideoStyleDNA): Record<string, unknown>[] {
    const styleInjection = styleDNA.replicationPrompts.cinematographyPrompt
    const colourInjection = styleDNA.replicationPrompts.colourGradeInstruction

    return shots.map(shot => ({
      ...shot,
      prompt_enhanced: shot.prompt_enhanced
        ? `${shot.prompt_enhanced}\n\nStyle reference: ${styleInjection}`
        : styleInjection,
      colourGradeInstruction: colourInjection,
      averageShotDuration: styleDNA.cinematography.averageShotDuration,
    }))
  }
}
