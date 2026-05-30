/**
 * LUTLoader — .cube LUT file parser and FFmpeg integration.
 * Supports 3D LUT (most common) and 1D LUT formats.
 */

export interface LUTMetadata {
  title:      string
  size:       number   // grid size (e.g. 33 for a 33x33x33 LUT)
  type:       '1D' | '3D'
  domainMin:  [number, number, number]
  domainMax:  [number, number, number]
  lines:      number
}

/** Parse .cube file header to extract metadata (no data loading needed for FFmpeg) */
export function parseCubeHeader(content: string): LUTMetadata {
  const lines     = content.split('\n')
  let title       = 'Untitled LUT'
  let size        = 33
  let type: '1D' | '3D' = '3D'
  const domainMin: [number, number, number] = [0, 0, 0]
  const domainMax: [number, number, number] = [1, 1, 1]

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('TITLE'))       title = trimmed.slice(5).trim().replace(/^"|"$/g, '')
    if (trimmed.startsWith('LUT_3D_SIZE')) size  = parseInt(trimmed.split(' ')[1])
    if (trimmed.startsWith('LUT_1D_SIZE')) { size = parseInt(trimmed.split(' ')[1]); type = '1D' }
    if (trimmed.startsWith('DOMAIN_MIN')) {
      const parts = trimmed.split(' ').slice(1).map(Number)
      if (parts.length === 3) { domainMin[0] = parts[0]; domainMin[1] = parts[1]; domainMin[2] = parts[2] }
    }
    if (trimmed.startsWith('DOMAIN_MAX')) {
      const parts = trimmed.split(' ').slice(1).map(Number)
      if (parts.length === 3) { domainMax[0] = parts[0]; domainMax[1] = parts[1]; domainMax[2] = parts[2] }
    }
  }

  const dataLines = lines.filter(l => {
    const t = l.trim()
    return t && !t.startsWith('#') && !t.startsWith('TITLE') && !t.startsWith('LUT') && !t.startsWith('DOMAIN')
  })

  return { title, size, type, domainMin, domainMax, lines: dataLines.length }
}

/** Build FFmpeg filter for applying a LUT file */
export function buildLUTFilter(lutPath: string, intensity = 1.0): string {
  if (intensity >= 1.0) {
    return `lut3d='${lutPath}'`
  }
  // Blend original with LUT-applied at specified intensity
  return [
    `[in]split[a][b]`,
    `[b]lut3d='${lutPath}'[lut_out]`,
    `[a][lut_out]blend=all_expr='A*(1-${intensity.toFixed(2)})+B*${intensity.toFixed(2)}'[out]`,
  ].join(';')
}

// Film emulation preset definitions — .cube files in /public/luts/film/
export const FILM_EMULATION_PRESETS = [
  { id: 'kodak-vision3-500t',  name: 'Kodak Vision3 500T',  file: 'kodak-vision3-500t.cube',  preview: '/luts/film/thumbs/kodak-vision3-500t.jpg' },
  { id: 'kodachrome-25',       name: 'Kodachrome 25',        file: 'kodachrome-25.cube',       preview: '/luts/film/thumbs/kodachrome-25.jpg' },
  { id: 'fuji-velvia-50',      name: 'Fuji Velvia 50',       file: 'fuji-velvia-50.cube',      preview: '/luts/film/thumbs/fuji-velvia-50.jpg' },
  { id: 'fuji-pro400h',        name: 'Fuji Pro 400H',        file: 'fuji-pro400h.cube',        preview: '/luts/film/thumbs/fuji-pro400h.jpg' },
  { id: 'agfa-vista-200',      name: 'Agfa Vista 200',       file: 'agfa-vista-200.cube',      preview: '/luts/film/thumbs/agfa-vista-200.jpg' },
  { id: 'ilford-hp5',          name: 'Ilford HP5 (B&W)',     file: 'ilford-hp5.cube',          preview: '/luts/film/thumbs/ilford-hp5.jpg' },
  { id: 'polaroid-600',        name: 'Polaroid 600',         file: 'polaroid-600.cube',        preview: '/luts/film/thumbs/polaroid-600.jpg' },
  { id: 'cinestill-800t',      name: 'CineStill 800T',       file: 'cinestill-800t.cube',      preview: '/luts/film/thumbs/cinestill-800t.jpg' },
  { id: 'kodak-ektar-100',     name: 'Kodak Ektar 100',      file: 'kodak-ektar-100.cube',     preview: '/luts/film/thumbs/kodak-ektar-100.jpg' },
  { id: 'kodak-portra-400',    name: 'Kodak Portra 400',     file: 'kodak-portra-400.cube',    preview: '/luts/film/thumbs/kodak-portra-400.jpg' },
  { id: 'lomography-x100',     name: 'Lomography X-Pro 100', file: 'lomography-x100.cube',     preview: '/luts/film/thumbs/lomography-x100.jpg' },
  { id: 'teal-orange',         name: 'Teal & Orange',        file: 'teal-orange.cube',         preview: '/luts/film/thumbs/teal-orange.jpg' },
  { id: 'bleach-bypass',       name: 'Bleach Bypass',        file: 'bleach-bypass.cube',       preview: '/luts/film/thumbs/bleach-bypass.jpg' },
  { id: 'cross-process',       name: 'Cross Process',        file: 'cross-process.cube',       preview: '/luts/film/thumbs/cross-process.jpg' },
  { id: 'vintage-fade',        name: 'Vintage Fade',         file: 'vintage-fade.cube',        preview: '/luts/film/thumbs/vintage-fade.jpg' },
  { id: 'kodak-2383',          name: 'Kodak 2383 Print',     file: 'kodak-2383.cube',          preview: '/luts/film/thumbs/kodak-2383.jpg' },
  { id: 'fuji-3513',           name: 'Fuji 3513 Print',      file: 'fuji-3513.cube',           preview: '/luts/film/thumbs/fuji-3513.jpg' },
  { id: 'arri-logc-to-709',    name: 'ARRI LogC → Rec.709', file: 'arri-logc-to-709.cube',    preview: '/luts/film/thumbs/arri-logc-to-709.jpg' },
  { id: 'desat-shadows',       name: 'Desaturated Shadows',  file: 'desat-shadows.cube',       preview: '/luts/film/thumbs/desat-shadows.jpg' },
  { id: 'cinematic-flat',      name: 'Cinematic Flat',       file: 'cinematic-flat.cube',      preview: '/luts/film/thumbs/cinematic-flat.jpg' },
] as const

export type FilmPresetId = typeof FILM_EMULATION_PRESETS[number]['id']
