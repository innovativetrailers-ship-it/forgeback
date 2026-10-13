jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 0, stdout: Buffer.from('ok'), stderr: Buffer.from(''), error: undefined })),
}))

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runArgv } from '../lib/shell/argv'

const HOSTILE = ['; id', '$(id)', '`id`', 'a b', "a'b", 'a"b', '-rf']

const HELPERS = [
  'src/app/api/highlights/extract/route.ts',
  'src/lib/upscale/clip.ts',
  'src/lib/film/FilmDirector.ts',
  'src/lib/swarm/AudioSwarm.ts',
  'src/app/api/translate/video/route.ts',
  'src/lib/upscale/grain.ts',
  'src/lib/upscale/face-enhance.ts',
  'src/lib/timeline/stabilise.ts',
  'src/lib/timeline/AutoReframe.ts',
  'src/lib/timeline/tracker.ts',
  'src/lib/timeline/ClipExtend.ts',
  'src/lib/timeline/retime.ts',
  'src/lib/studio/continuity.ts',
  'src/lib/studio/colour.ts',
  'src/lib/audio/StudioSound.ts',
  'src/lib/audio/ProToolsExport.ts',
  'src/lib/storage/raw-ingest.ts',
  'src/lib/spatial/SpatialExport.ts',
  'src/lib/avatar/AvatarEngine.ts',
  'src/app/api/color/lut/route.ts',
  'src/app/api/color/cdl/route.ts',
  'src/app/api/export/stems/route.ts',
]

describe('shell arguments', () => {
  it('does not interpolate a request path into a shell command', () => {
    for (const file of HELPERS) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/execSync\s*\(/)
      expect(text).not.toMatch(/exec\s*\(`/)
      expect(text).not.toMatch(/shell\s*:\s*true/)
    }
  })

  it('refuses a binary that is not ffmpeg or ffprobe', () => {
    expect(() => runArgv('sh', ['-c', 'echo hi'])).toThrow(/Unsupported binary/)
  })

  it.each(HOSTILE)('keeps %j as one argument for every media helper', (sample) => {
    runArgv('ffmpeg', ['-i', sample, 'out.mp4'])
    expect(spawnSync).toHaveBeenCalledWith(
      'ffmpeg',
      ['-i', sample, 'out.mp4'],
      expect.objectContaining({ shell: false }),
    )
  })
})
