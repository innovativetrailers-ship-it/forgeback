import { readFileSync } from 'node:fs'
import { runArgv } from '../lib/shell/argv'

describe('shell arguments', () => {
  const files = [
    'src/app/api/highlights/extract/route.ts',
    'src/lib/upscale/clip.ts',
    'src/lib/film/FilmDirector.ts',
    'src/lib/swarm/AudioSwarm.ts',
    'src/app/api/translate/video/route.ts',
  ]

  it('does not interpolate a request path into a shell command', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/execSync\(`/)
      expect(text).not.toMatch(/exec\(`/)
    }
  })

  it('refuses a binary that is not ffmpeg or ffprobe', () => {
    expect(() => runArgv('sh', ['-c', 'echo hi'])).toThrow(/Unsupported binary/)
  })
})
