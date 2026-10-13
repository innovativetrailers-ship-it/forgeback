import { runModel1 } from '../brain/model1'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import type { CastMember, SceneCast, MakeupState, MakeupEffect } from './types'

export class CastManager {

  async buildMultiCharacterPayload(
    sceneCast: SceneCast,
    castMembers: CastMember[],
    sceneDescription: string
  ): Promise<{
    enrichedPrompt: string
    characterReferences: string[]
    loraIds: string[]
    modelRecommendation: string
    reasoning: string
  }> {
    const activeCast = sceneCast.castMembers.map(sc => ({
      ...sc,
      member: castMembers.find(m => m.id === sc.characterId)!,
    })).filter(sc => sc.member)

    let modelRecommendation: string
    let reasoning: string

    if (activeCast.length === 1) {
      const char = activeCast[0].member
      modelRecommendation = char.lockedModelFamily ?? refuseSilentModelSwap(char.name, 'seedance_2_0')
      reasoning = `Single character scene — using ${char.name}'s locked model`
    } else if (activeCast.length === 2) {
      modelRecommendation = 'seedance_2_0'
      reasoning = 'Two-character scene — Seedance 2.0 excels at character pair consistency'
    } else if (activeCast.length <= 5) {
      modelRecommendation = 'hunyuan_1_5'
      reasoning = `${activeCast.length}-character scene — HunyuanVideo for small group dynamics`
    } else {
      modelRecommendation = 'hunyuan_1_5'
      reasoning = `Large cast scene (${activeCast.length} characters) — HunyuanVideo crowd specialist`
    }

    const characterBlocks = activeCast.map(sc => {
      const char = sc.member
      const makeupState = sc.makeupOverride ?? sc.member.makeupByScene[sceneCast.sceneId] ?? sc.member.makeupState
      const costume = sc.costumeOverride ?? sc.member.costumesByScene[sceneCast.sceneId]

      return `[CHARACTER: ${char.name}]
Appearance: ${char.baseAppearance.promptDescription}
Position: ${sc.blocking}
${costume ? `Wearing: ${costume.description}` : ''}
${makeupState.effects.length > 0 ? `Makeup/SFX: ${makeupState.promptInjection}` : ''}
Action: ${sc.action}
${sc.isDialogue ? `Dialogue: ${sc.dialogueLines?.join(' / ') ?? ''}` : ''}
[/CHARACTER]`
    }).join('\n\n')

    const characterReferences = activeCast.flatMap(sc =>
      sc.member.faceReferenceUrls.slice(0, 3)
    )
    const loraIds = activeCast
      .filter(sc => sc.member.loraStatus === 'ready' && sc.member.loraModelId)
      .map(sc => sc.member.loraModelId!)

    const promptResponse = await runModel1({
      systemPrompt: `You are the Art Director for CINÉMA. Write a video generation prompt for a multi-character scene.
Each character block defines who is in frame and what they're doing.
Write a single coherent prompt that captures all characters naturally.
Model target: ${modelRecommendation}. For Seedance 2.0: emphasise character appearance details, emotional state, fine facial detail.
For HunyuanVideo: emphasise spatial arrangement, group dynamics, energy of the crowd. Ensure each character has distinct screen presence and the camera captures the full ensemble.
Return ONLY the prompt string.`,
      userMessage: `Scene: ${sceneDescription}\n\n${characterBlocks}`,
      requireJSON: false,
    })

    return {
      enrichedPrompt: promptResponse.content.trim(),
      characterReferences,
      loraIds,
      modelRecommendation,
      reasoning,
    }
  }

  compileMakeupPrompt(makeupState: MakeupState): string {
    if (makeupState.effects.length === 0) return ''
    return makeupState.effects
      .map(effect => this.effectToPromptString(effect))
      .filter(Boolean)
      .join(', ')
  }

  private effectToPromptString(effect: MakeupEffect): string {
    const intensity = effect.intensity < 0.33 ? 'subtle' : effect.intensity < 0.66 ? 'moderate' : 'heavy'
    const location = effect.location.replace(/_/g, ' ')

    if (effect.customDescription) return effect.customDescription

    const descriptions: Partial<Record<string, string>> = {
      blood_fresh: `${intensity} fresh bright red blood on ${location}, wet and glistening`,
      blood_dried: `${intensity} dried dark brownish-red blood on ${location}, crusted and flaking`,
      blood_arterial: `arterial blood spray on ${location}, high-pressure spray pattern, bright red`,
      blood_seeping: `blood slowly seeping from wound on ${location}, dark red pooling`,
      wound_cut: `${intensity} cut wound on ${location}, clean laceration with visible tissue`,
      wound_laceration: `${intensity} jagged laceration on ${location}, torn skin edges, raw tissue visible`,
      wound_puncture: `puncture wound on ${location}, entry hole, surrounding bruising`,
      wound_abrasion: `${intensity} road rash abrasion on ${location}, scraped skin, raw and bloody`,
      wound_bite: `bite wound on ${location}, tooth mark indentations, bruising and punctures`,
      wound_gunshot: `gunshot wound on ${location}, entry wound with powder burns and blood`,
      wound_stab: `stab wound on ${location}, puncture with bleeding edges`,
      burn_first_degree: `first degree burn on ${location}, red irritated skin, mild swelling`,
      burn_second_degree: `second degree burn on ${location}, blistered skin, weeping fluid, bright red`,
      burn_third_degree: `third degree burn on ${location}, charred blackened skin, leathery texture, no bleeding`,
      burn_chemical: `chemical burn on ${location}, irregular pattern, corrosive damage, discoloured skin`,
      burn_electrical: `electrical burn on ${location}, entry and exit marks, charred edges`,
      burn_friction: `friction burn on ${location}, raw scraped skin, road rash pattern`,
      bruise_fresh: `fresh bruise on ${location}, red and slightly swollen, just forming`,
      bruise_24hr: `24-hour-old bruise on ${location}, purple and blue discolouration, swollen`,
      bruise_healing: `healing bruise on ${location}, yellow-green edges, purple centre, fading`,
      bruise_old: `old fading bruise on ${location}, yellow-green discolouration, nearly healed`,
      scar_healed: `healed scar on ${location}, lighter skin, slightly raised or indented`,
      scar_keloid: `raised keloid scar on ${location}, thick raised tissue, pink-purple discolouration`,
      scar_surgical: `surgical scar on ${location}, thin straight line, healed with slight shine`,
      scar_battle: `battle scar on ${location}, jagged healed wound, weathered tough skin`,
      dirt_general: `${intensity} dirt and grime on ${location}, brown-grey soil smearing`,
      dirt_mud: `${intensity} wet mud on ${location}, dark brown splatters and coating`,
      dirt_coal_dust: `coal dust on ${location}, fine black powder coating, mining aesthetic`,
      ash_fire: `fire ash on ${location}, grey-white ash coating, post-fire survivor look`,
      ash_volcanic: `volcanic ash on ${location}, fine grey powder, apocalyptic`,
      grease_mechanical: `mechanical grease on ${location}, dark grey-black oily smears, mechanic look`,
      oil_motor: `motor oil on ${location}, dark iridescent sheen, workshop look`,
      sweat_heavy: `heavy sweat on ${location}, glistening wet skin, droplets, exertion`,
      sweat_exhaustion: `extreme exhaustion sweat on ${location}, completely drenched, heat stroke look`,
      pallor_sick: `sickly pallor on ${location}, grey-white skin tone, dark circles`,
      pallor_death: `death pallor on ${location}, waxy grey-blue skin, no life colour`,
      infection_wound: `infected wound on ${location}, red angry edges, yellow pus, swelling`,
      infection_skin: `skin infection on ${location}, red inflamed patches, pustules`,
      necrosis: `necrotic tissue on ${location}, blackened dead skin, gangrene`,
      jaundice: `jaundice on ${location}, yellow-orange skin tone, scleral yellowing`,
      age_10yr: `10 years of aging on ${location}, fine lines, slight sagging, age spots`,
      age_20yr: `20 years of aging on ${location}, wrinkles, prominent lines, thinning skin`,
      age_40yr: `40 years of aging on ${location}, deep wrinkles, heavy jowls, age-spotted`,
      age_extreme: `extreme elderly aging on ${location}, paper-thin wrinkled skin, liver spots, skeletal`,
      undead_zombie: `zombie decomposition on ${location}, grey-green skin, rotting flesh, exposed bone`,
      tearstains: `tear stains on ${location}, streaked mascara, red eyes, emotional breakdown`,
    }

    return descriptions[effect.category] ?? `${effect.category.replace(/_/g, ' ')} on ${location}`
  }
}
