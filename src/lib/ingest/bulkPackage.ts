export const BUNDLE_ROLES = ['script', 'screenplay', 'audio', 'characters', 'assets', 'locations', 'style', 'auto'] as const
export type BundleRole = (typeof BUNDLE_ROLES)[number]

export interface BundleEntity {
  kind: 'character' | 'asset' | 'location' | 'voice' | 'style'
  name: string
  prompt: string
  rules: string
  negativePrompt: string
  variations: string[]
  sourceFile: string
}

export interface BundleAttention {
  file: string
  text: string
  reason: string
}

export interface BundleDraft {
  files: { path: string; role: BundleRole; inferred: boolean }[]
  entities: BundleEntity[]
  shots: { heading: string; prompt: string }[]
  cues: { kind: string; text: string }[]
  style: string
  media: { path: string; kind: 'image' | 'audio' | 'model' }[]
  attention: BundleAttention[]
  screenplay: string
}

const MEDIA: Record<string, 'image' | 'audio' | 'model'> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  mp3: 'audio', wav: 'audio', aac: 'audio', m4a: 'audio',
  glb: 'model', gltf: 'model', obj: 'model', fbx: 'model',
}

function hasFolder(path: string, name: string): boolean {
  return path === name || path.startsWith(`${name}/`) || path.includes(`/${name}/`) || path.includes(name)
}

export function inferRole(filePath: string): BundleRole {
  const path = filePath.toLowerCase().replace(/\\/g, '/')
  if (hasFolder(path, 'character')) return 'characters'
  if (hasFolder(path, 'location')) return 'locations'
  if (hasFolder(path, 'asset') || path.includes('prop')) return 'assets'
  if (path.includes('screenplay')) return 'screenplay'
  if (path.includes('script')) return 'script'
  if (path.includes('lyric') || path.includes('cue') || hasFolder(path, 'audio')) return 'audio'
  if (path.includes('style') || path.includes('look')) return 'style'
  return 'auto'
}

export function isBundleRole(value: string): value is BundleRole {
  return (BUNDLE_ROLES as readonly string[]).includes(value)
}

export function mediaKind(filePath: string): 'image' | 'audio' | 'model' | null {
  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  return MEDIA[ext] ?? null
}

export function docxText(xml: string): string {
  return xml
    .replace(/<w:p[ >]/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function rtfText(raw: string): string {
  return raw
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .trim()
}

function kindFor(role: BundleRole): BundleEntity['kind'] | null {
  if (role === 'characters') return 'character'
  if (role === 'assets') return 'asset'
  if (role === 'locations') return 'location'
  if (role === 'style') return 'style'
  if (role === 'audio') return 'voice'
  return null
}

function variationsOf(value: string): string[] {
  return value.split(/[,|]/).map((part) => part.trim().replace(/^@/, '')).filter((part) => part.length > 1)
}

function entity(kind: BundleEntity['kind'], name: string, fields: Partial<BundleEntity>, sourceFile: string): BundleEntity | null {
  const label = name.trim()
  if (label.length < 2) return null
  return {
    kind,
    name: label,
    prompt: fields.prompt?.trim() ?? '',
    rules: fields.rules?.trim() ?? '',
    negativePrompt: fields.negativePrompt?.trim() ?? '',
    variations: fields.variations ?? [],
    sourceFile,
  }
}

export function entitiesFromText(text: string, role: BundleRole, sourceFile: string): BundleEntity[] {
  const kind = kindFor(role)
  if (!kind || kind === 'voice') return []
  const rows = tableRows(text)
  if (rows) {
    return rows.map((row) => entity(kind, row.name ?? '', {
      prompt: row.prompt ?? row.description ?? '',
      rules: row.rules ?? '',
      negativePrompt: row.negative ?? row.negativeprompt ?? '',
      variations: variationsOf(row.variations ?? ''),
    }, sourceFile)).filter((row): row is BundleEntity => Boolean(row))
  }
  const blocks = text.split(/\n(?=# )/g)
  const found: BundleEntity[] = []
  for (const block of blocks) {
    const name = block.match(/^#\s+(.+)$/m)?.[1] ?? ''
    const prompt = block.match(/^prompt:\s*(.+)$/im)?.[1] ?? ''
    const rules = block.match(/^rules:\s*(.+)$/im)?.[1] ?? ''
    const negativePrompt = block.match(/^negative:\s*(.+)$/im)?.[1] ?? ''
    const variations = variationsOf(block.match(/^variations:\s*(.+)$/im)?.[1] ?? '')
    const row = entity(kind, name, { prompt, rules, negativePrompt, variations }, sourceFile)
    if (row) found.push(row)
  }
  return found
}

function tableRows(text: string): Array<Record<string, string>> | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : ''
  if (!delimiter) return null
  const header = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase())
  if (!header.includes('name')) return null
  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter)
    const row: Record<string, string> = {}
    header.forEach((key, index) => { row[key] = cells[index]?.trim() ?? '' })
    return row
  })
}

export function shotsFromScreenplay(text: string): { heading: string; prompt: string }[] {
  const lines = text.split(/\r?\n/)
  const shots: { heading: string; prompt: string }[] = []
  let heading = ''
  let body: string[] = []
  function flush() {
    if (!heading) return
    shots.push({ heading, prompt: body.join(' ').trim() || heading })
    body = []
  }
  for (const line of lines) {
    if (/^(INT\.|EXT\.|INT\/EXT\.)/i.test(line.trim())) {
      flush()
      heading = line.trim()
    } else if (heading) {
      body.push(line.trim())
    }
  }
  flush()
  return shots
}

export function cuesFromText(text: string): { kind: string; text: string }[] {
  return text.split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^(CUE|LYRIC|SFX|VOICE)\s*:\s*(.+)$/i)
    return match ? { kind: match[1].toLowerCase(), text: match[2].trim() } : null
  }).filter((row): row is { kind: string; text: string } => Boolean(row))
}

/** Tabular cast lists and headed screenplays stay local. Free prose goes through ingest. */
export function needsLlmNormalise(path: string, text: string): boolean {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'tsv') return false
  const body = text.trim()
  if (body.length < 40) return false
  if (shotsFromScreenplay(body).length) return false
  if (entitiesFromText(body, 'characters', path).length) return false
  if (cuesFromText(body).length) return false
  return true
}

export function shotsAndEntitiesFromBreakdown(
  breakdown: {
    scenes: Array<{ location?: string; description?: string; shots: Array<{ id?: string; description?: string }> }>
    entities: Array<{ kind: string; name: string; descriptor?: string; variations?: Array<{ label?: string }> }>
  },
  sourceFile: string,
): { shots: BundleDraft['shots']; entities: BundleEntity[]; fallback: boolean } {
  const only = breakdown.scenes.length === 1 ? breakdown.scenes[0].shots : []
  const fallback = breakdown.entities.length === 0 && only.length === 1 && only[0]?.id === 'scene-1-shot-0'
  if (fallback) return { shots: [], entities: [], fallback: true }
  const shots = breakdown.scenes.flatMap((scene) => scene.shots.map((shot) => ({
    heading: scene.location || scene.description || 'Shot',
    prompt: shot.description?.trim() || scene.description || '',
  }))).filter((shot) => shot.prompt.length > 0)
  const entities = breakdown.entities.map((row) => entity(
    row.kind === 'location' ? 'location' : row.kind === 'asset' ? 'asset' : 'character',
    row.name,
    {
      prompt: row.descriptor ?? '',
      variations: (row.variations ?? []).map((item) => item.label ?? '').filter((label) => label.length > 1),
    },
    sourceFile,
  )).filter((row): row is BundleEntity => Boolean(row))
  return { shots, entities, fallback: false }
}

export function assembleBundle(inputs: Array<{ path: string; role?: string; text?: string }>): BundleDraft {
  const draft: BundleDraft = {
    files: [],
    entities: [],
    shots: [],
    cues: [],
    style: '',
    media: [],
    attention: [],
    screenplay: '',
  }
  for (const input of inputs) {
    const media = mediaKind(input.path)
    if (media) {
      draft.media.push({ path: input.path, kind: media })
      draft.files.push({ path: input.path, role: inferRole(input.path), inferred: !input.role })
      continue
    }
    const requested = input.role && isBundleRole(input.role) ? input.role : 'auto'
    const role = requested === 'auto' ? inferRole(input.path) : requested
    draft.files.push({ path: input.path, role, inferred: requested === 'auto' })
    const text = input.text?.trim() ?? ''
    if (!text) {
      draft.attention.push({ file: input.path, text: '', reason: 'No text could be read from this file.' })
      continue
    }
    if (role === 'auto') {
      const shots = shotsFromScreenplay(text)
      if (shots.length) {
        draft.shots.push(...shots)
        draft.screenplay = [draft.screenplay, text].filter(Boolean).join('\n\n')
        continue
      }
      draft.attention.push({ file: input.path, text: text.slice(0, 2000), reason: 'The role was not inferred. Tag it and parse again.' })
      continue
    }
    if (role === 'script' || role === 'screenplay') {
      const shots = shotsFromScreenplay(text)
      draft.screenplay = [draft.screenplay, text].filter(Boolean).join('\n\n')
      if (shots.length) draft.shots.push(...shots)
      else draft.attention.push({ file: input.path, text: text.slice(0, 2000), reason: 'No scene headings were found. The text is kept for you to edit.' })
      continue
    }
    if (role === 'audio') {
      const cues = cuesFromText(text)
      if (cues.length) draft.cues.push(...cues)
      else draft.attention.push({ file: input.path, text: text.slice(0, 2000), reason: 'No CUE, LYRIC, SFX, or VOICE lines were found.' })
      continue
    }
    if (role === 'style') {
      draft.style = [draft.style, text].filter(Boolean).join('\n')
      const row = entity('style', input.path.split('/').pop() ?? 'style', { prompt: text }, input.path)
      if (row) draft.entities.push(row)
      continue
    }
    const entities = entitiesFromText(text, role, input.path)
    if (entities.length) draft.entities.push(...entities)
    else draft.attention.push({ file: input.path, text: text.slice(0, 2000), reason: 'No named rows were found. The text is kept.' })
  }
  return draft
}
