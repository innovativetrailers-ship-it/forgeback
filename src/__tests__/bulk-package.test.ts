import { assembleBundle, docxText, inferRole, needsLlmNormalise, shotsAndEntitiesFromBreakdown, shotsFromScreenplay } from '@/lib/ingest/bulkPackage'

describe('bulk package import', () => {
  it('infers roles, parses cast and scenes, and flags the rest', () => {
    expect(inferRole('package/characters/leads.md')).toBe('characters')
    expect(inferRole('notes/misc.txt')).toBe('auto')
    const draft = assembleBundle([
      {
        path: 'characters/leads.md',
        text: '# Mara\nprompt: a pilot\nrules: scar on the left brow\nnegative: no helmet\nvariations: suited, unmasked',
      },
      {
        path: 'assets/props.csv',
        text: 'name,prompt,rules,negative,variations\nCompass,brass compass,always in the left hand,no glow,open|shut',
      },
      {
        path: 'screenplay/film.md',
        text: 'INT. HANGAR - NIGHT\nMara checks the compass.\nEXT. RUNWAY - DAWN\nThe plane turns.',
      },
      { path: 'notes/misc.txt', text: 'just a note with no headings' },
      { path: 'characters/portrait.png' },
    ])
    expect(draft.entities.map((row) => row.name)).toEqual(['Mara', 'Compass'])
    expect(draft.entities[0].negativePrompt).toBe('no helmet')
    expect(draft.entities[0].rules).toMatch(/scar/)
    expect(draft.entities[0].variations).toEqual(['suited', 'unmasked'])
    expect(draft.entities[1].kind).toBe('asset')
    expect(draft.shots).toHaveLength(2)
    expect(draft.shots[0].prompt).toMatch(/compass/)
    expect(draft.attention.some((item) => item.file === 'notes/misc.txt')).toBe(true)
    expect(draft.media).toEqual([{ path: 'characters/portrait.png', kind: 'image' }])
    expect(shotsFromScreenplay('no headings here')).toEqual([])
    expect(docxText('<w:p><w:t>Hello &amp; co</w:t></w:p>')).toMatch(/Hello & co/)
    expect(needsLlmNormalise('cast.csv', 'name,prompt\nMara,pilot')).toBe(false)
    expect(needsLlmNormalise('notes/prose.txt', 'A pilot walks into a hangar and finds the compass she lost at dawn, then turns toward the runway.')).toBe(true)
    const merged = shotsAndEntitiesFromBreakdown({
      scenes: [{ location: 'Hangar', shots: [{ description: 'Mara checks the compass' }] }],
      entities: [{ kind: 'character', name: 'Mara', descriptor: 'a pilot with a scar' }],
    }, 'notes/prose.txt')
    expect(merged.fallback).toBe(false)
    expect(merged.entities[0].prompt).toMatch(/scar/)
    expect(shotsAndEntitiesFromBreakdown({
      scenes: [{ shots: [{ id: 'scene-1-shot-0', description: 'loose' }] }],
      entities: [],
    }, 'notes/prose.txt').fallback).toBe(true)
  })
})