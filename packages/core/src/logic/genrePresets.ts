import type { PromptCamera } from './identity'

export const GENRE_FAMILIES = ['movie', 'tv', 'anime', 'documentary', 'sport', 'racing'] as const
export type GenreFamily = (typeof GENRE_FAMILIES)[number]

export interface GenrePreset {
  id: string
  family: GenreFamily
  label: string
  stylePrompt: string
  gradeParams: { look: string }
  cameraDefaults: PromptCamera
  pacing: string
  grain: string
}

function preset(
  family: GenreFamily,
  slug: string,
  label: string,
  stylePrompt: string,
  grade: string,
  camera: PromptCamera,
  pacing: string,
  grain: string,
): GenrePreset {
  return {
    id: `${family}.${slug}`,
    family,
    label,
    stylePrompt,
    gradeParams: { look: grade },
    cameraDefaults: camera,
    pacing,
    grain,
  }
}

const WS: PromptCamera = { shotSize: 'WS', angle: 'eye-level', movement: 'static', lens: 'spherical', speed: 'normal' }
const CU: PromptCamera = { shotSize: 'CU', angle: 'eye-level', movement: 'static', lens: 'spherical', speed: 'normal' }
const MS: PromptCamera = { shotSize: 'MS', angle: 'eye-level', movement: 'dolly', lens: 'spherical', speed: 'normal' }
const HANDHELD: PromptCamera = { shotSize: 'MS', angle: 'eye-level', movement: 'handheld', lens: 'spherical', speed: 'normal' }
const AERIAL: PromptCamera = { shotSize: 'EWS', angle: 'high', movement: 'crane', lens: 'spherical', speed: 'slow' }
const ONBOARD: PromptCamera = { shotSize: 'CU', angle: 'eye-level', movement: 'follow', lens: 'wide', speed: 'fast' }
const SLOMO: PromptCamera = { shotSize: 'MCU', angle: 'low', movement: 'tracking', lens: 'telephoto', speed: 'slow' }

export const GENRE_PRESETS: GenrePreset[] = [
  preset('movie', 'action', 'Action', 'blockbuster action coverage, kinetic geography, practical stunt energy', 'high-contrast teal-and-orange, crushed blacks', { shotSize: 'WS', angle: 'low', movement: 'tracking', lens: 'anamorphic', speed: 'fast' }, 'rapid coverage, punch-ins on impact', 'moderate 35mm grain'),
  preset('movie', 'sci-fi', 'Sci-Fi', 'speculative production design, cool practical lighting, vast interiors', 'cool cyan highlights, deep navy shadows', { shotSize: 'WS', angle: 'eye-level', movement: 'dolly', lens: 'anamorphic', speed: 'slow' }, 'held wide masters, slow reveals', 'fine digital grain'),
  preset('movie', 'drama', 'Drama', 'intimate naturalistic drama, motivated practicals, faces over spectacle', 'warm skin, gentle roll-off, muted primaries', CU, 'patient singles, delayed cut', 'fine 35mm grain'),
  preset('movie', 'romance', 'Romance', 'soft romantic framing, catchlights, lingering two-shots', 'warm rose highlights, lifted shadows', { shotSize: 'MCU', angle: 'eye-level', movement: 'dolly', lens: 'spherical', speed: 'slow' }, 'lingering holds, gentle crossfade rhythm', 'soft halation, light grain'),
  preset('movie', 'comedy', 'Comedy', 'clear comic geography, readable faces, timed reaction coverage', 'bright even key, clean whites', MS, 'setup-punchline cutting, reaction beats', 'clean, low grain'),
  preset('movie', 'horror', 'Horror', 'dread in negative space, underexposed edges, threat off-frame', 'crushed blacks, sickly green-cyan, low midtones', { shotSize: 'MS', angle: 'low', movement: 'static', lens: 'wide', speed: 'slow' }, 'long holds, sudden inserts', 'heavy grain, crushed texture'),
  preset('movie', 'thriller', 'Thriller', 'paranoid thriller framing, surveillance angles, tight information', 'cold steel grade, hard contrast', { shotSize: 'MCU', angle: 'high', movement: 'handheld', lens: 'spherical', speed: 'normal' }, 'tight coverage, accelerating cuts', 'moderate grain'),
  preset('movie', 'fantasy', 'Fantasy', 'mythic scale, costume silhouette, painterly light', 'golden hour warmth, rich shadows', { shotSize: 'WS', angle: 'low', movement: 'crane', lens: 'anamorphic', speed: 'slow' }, 'processional pacing, tableau holds', 'fine grain, slight bloom'),

  preset('tv', 'drama-series', 'Drama Series', 'premium series drama, episodic coverage, character blocking', 'cinematic TV grade, controlled contrast', MS, 'scene-driven cutting, act-out buttons', 'fine grain'),
  preset('tv', 'sitcom', 'Sitcom', 'multi-camera sitcom stage, frontal comic blocking, live-audience geography', 'bright sitcom key, warm fill', { shotSize: 'MS', angle: 'eye-level', movement: 'static', lens: 'spherical', speed: 'normal' }, 'joke-timed cuts, reaction pairs', 'clean video, no grain'),
  preset('tv', 'procedural', 'Procedural', 'case-of-the-week procedural, evidence inserts, interview singles', 'cool institutional grade, hard fluorescents', { shotSize: 'MS', angle: 'eye-level', movement: 'dolly', lens: 'spherical', speed: 'normal' }, 'A-to-B plot cutting, clue inserts', 'low grain'),
  preset('tv', 'reality', 'Reality', 'observational reality coverage, follow-cam, confessionals', 'saturated reality grade, punchy contrast', HANDHELD, 'confessionals and follow-cam intercut', 'video texture'),
  preset('tv', 'soap', 'Soap', 'daytime serial intensity, emotional close-ups, studio lighting', 'warm soap key, glossy skin', CU, 'dialogue ping-pong, freeze on look', 'clean, low grain'),

  preset('anime', 'shonen', 'Shonen', 'high-energy action anime look, graphic speed lines, heroic silhouettes — style descriptor, not a studio replica', 'high-saturation cel color, hard ink lines', { shotSize: 'WS', angle: 'low', movement: 'tracking', lens: 'wide', speed: 'fast' }, 'impact frames, rapid action cuts', 'flat cel, no photochemical grain'),
  preset('anime', 'shojo', 'Shojo', 'lyrical character-focused anime look, sparkle highlights, emotional close-ups — style descriptor only', 'pastel palette, soft bloom', { shotSize: 'MCU', angle: 'eye-level', movement: 'dolly', lens: 'spherical', speed: 'slow' }, 'lingering emotional holds', 'soft glow, no film grain'),
  preset('anime', 'seinen', 'Seinen', 'grounded adult anime look, urban night, restrained motion — style descriptor only', 'muted realist palette, deep shadows', MS, 'deliberate cuts, quiet masters', 'subtle paper texture'),
  preset('anime', 'mecha', 'Mecha', 'mechanical-design anime look, scale contrast of machine vs human — style descriptor only', 'cool metal grade, panel-line contrast', { shotSize: 'WS', angle: 'low', movement: 'crane', lens: 'wide', speed: 'slow' }, 'scale reveals, impact holds', 'hard-edge cel'),
  preset('anime', 'slice-of-life', 'Slice-of-Life', 'everyday anime look, ambient weather, quiet blocking — style descriptor only', 'soft daylight, gentle saturation', { shotSize: 'MS', angle: 'eye-level', movement: 'static', lens: 'spherical', speed: 'slow' }, 'observational pacing', 'soft texture'),
  preset('anime', 'cel-shaded', 'Cel-shaded', 'cel-shaded animation look, hard shadow shapes, graphic color holds — not a brand replica', 'posterized color, inked outlines', WS, 'held compositions, graphic cuts', 'no photochemical grain'),
  preset('anime', 'modern-digital', 'Modern-digital', 'modern digital animation look, composite lighting, subtle depth of field — style descriptor only', 'clean digital grade, controlled bloom', MS, 'fluid motion, contemporary cutting', 'clean digital, no grain'),

  preset('documentary', 'history', 'History', 'historical documentary, archival inserts, measured narration coverage', 'desaturated period grade, warm highlights', WS, 'interview, archive, landscape intercut', 'archival grain mix'),
  preset('documentary', 'science', 'Science', 'science documentary, process close-ups, clarifying graphics space', 'clean cool grade, high micro-contrast', { shotSize: 'CU', angle: 'eye-level', movement: 'dolly', lens: 'macro', speed: 'slow' }, 'explain-then-show pacing', 'clean, low grain'),
  preset('documentary', 'nature', 'Nature', 'nature documentary, animal behavior, landscape scale', 'rich naturalistic greens, golden rims', AERIAL, 'observational long takes', 'fine grain'),
  preset('documentary', 'political', 'Political', 'political documentary, verité access, institutional interiors', 'hard news contrast, cool shadows', HANDHELD, 'verité bursts, talking-head punctuation', 'video grain'),
  preset('documentary', 'true-crime', 'True-Crime', 'true-crime documentary, evidence boards, night exteriors', 'cold teal, crushed shadows', { shotSize: 'MS', angle: 'high', movement: 'static', lens: 'spherical', speed: 'slow' }, 'reenactment fragments, title cards', 'heavy grain'),
  preset('documentary', 'biography', 'Biography', 'biographical documentary, photographs, lived-in interiors', 'warm memory grade, faded blacks', MS, 'photo-to-interview rhythm', 'fine grain'),
  preset('documentary', 'investigative', 'Investigative', 'investigative documentary, hidden-camera feel, documents in frame', 'stark contrast, sickly fluorescents', HANDHELD, 'drop-the-doc cutting', 'harsh video texture'),

  preset('sport', 'broadcast', 'Broadcast', 'sports broadcast coverage, sideline long lens, scoreboard geography', 'punchy broadcast grade, saturated primaries', { shotSize: 'WS', angle: 'high', movement: 'tracking', lens: 'telephoto', speed: 'fast' }, 'play-action cutting, replay inserts', 'clean HD, no grain'),
  preset('sport', 'cinematic-slow-mo', 'Cinematic-slow-mo', 'cinematic sports slow motion, sweat and fabric detail, heroic isolation', 'rich cinematic contrast, rim light', SLOMO, 'held slow-motion beats', 'fine grain'),
  preset('sport', 'hype-reel', 'Hype-reel', 'sports hype reel, smash cuts, crowd surge, graphic energy', 'high-contrast crushed look, neon accents', { shotSize: 'CU', angle: 'low', movement: 'handheld', lens: 'wide', speed: 'fast' }, 'smash cuts, music-timed hits', 'gritty grain'),
  preset('sport', 'analysis', 'Analysis', 'sports analysis, tactical overs, clear diagram space', 'neutral grade, readable whites', MS, 'pause, draw, resume', 'clean, no grain'),

  preset('racing', 'onboard', 'Onboard', 'cockpit onboard racing, wheel and track rush, vibration', 'hot highlights, motion-smear contrast', ONBOARD, 'unbroken onboard takes', 'video noise'),
  preset('racing', 'broadcast', 'Broadcast', 'motorsport broadcast, chase cam, pack geography', 'punchy broadcast grade', { shotSize: 'WS', angle: 'high', movement: 'tracking', lens: 'telephoto', speed: 'fast' }, 'leader cuts, gap graphics space', 'clean HD'),
  preset('racing', 'cinematic', 'Cinematic', 'cinematic racing, low tracking beauty, light play on bodywork', 'filmic contrast, warm metal', { shotSize: 'WS', angle: 'low', movement: 'tracking', lens: 'anamorphic', speed: 'fast' }, 'beauty passes, delayed cut', 'fine 35mm grain'),
  preset('racing', 'drift-rally', 'Drift-Rally', 'drift and rally look, dust and slide, tight forest/urban walls', 'dusty warm grade, high shutter smear', { shotSize: 'MS', angle: 'low', movement: 'handheld', lens: 'wide', speed: 'fast' }, 'slide holds, dirt hits', 'gritty grain'),
  preset('racing', 'f1-style', 'F1-style', 'open-wheel broadcast look: pit wall, grid ceremony, onboard-to-helicopter — a coverage style, not a team replica', 'high-gloss broadcast grade, saturated team-color-agnostic primaries', { shotSize: 'WS', angle: 'high', movement: 'crane', lens: 'telephoto', speed: 'fast' }, 'lap-timed cutting, pit inserts', 'clean HD'),
]

const BY_ID = new Map(GENRE_PRESETS.map((row) => [row.id, row]))

export function isGenreFamily(value: string): value is GenreFamily {
  return (GENRE_FAMILIES as readonly string[]).includes(value)
}

export function isGenrePresetId(value: string): boolean {
  return BY_ID.has(value)
}

export function genrePreset(id: string | null | undefined): GenrePreset | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

export function presetsForFamily(family: GenreFamily): GenrePreset[] {
  return GENRE_PRESETS.filter((row) => row.family === family)
}

export function mergeCameraDefaults(
  camera: PromptCamera | null | undefined,
  defaults?: PromptCamera,
): PromptCamera | null {
  if (!defaults) return camera ?? null
  return {
    angle: camera?.angle?.trim() || defaults.angle,
    movement: camera?.movement?.trim() || defaults.movement,
    shotSize: camera?.shotSize?.trim() || defaults.shotSize,
    lens: camera?.lens?.trim() || defaults.lens,
    speed: camera?.speed?.trim() || defaults.speed,
  }
}

export function genreStyleFragment(id: string | null | undefined): string {
  const preset = genrePreset(id)
  if (!preset) return ''
  return [
    `Look: ${preset.stylePrompt}.`,
    `Grade: ${preset.gradeParams.look}.`,
    `Pacing: ${preset.pacing}.`,
    `Grain: ${preset.grain}.`,
  ].join(' ')
}

/** Instant presets are descriptors. Never a shipped LoRA of a studio's films. */
export const BRAND_REPLICATION_PRESETS = false
