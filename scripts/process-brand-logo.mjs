#!/usr/bin/env node
/**
 * Process Cinematic Forge logo: remove checkerboard background, emit web + desktop assets.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const v3Root = path.join(root, '..', 'cinematic-forge-v3')

const SOURCE =
  process.argv[2] ??
  path.join(
    process.env.HOME ?? '',
    '.cursor/projects/Users-imac-cinema-cinema/assets/logo-96b1ba17-9038-4974-98af-cd01ff609a2b.png',
  )

const OUT = {
  webBrand: path.join(root, 'public/brand'),
  webIcon32: path.join(root, 'public/brand/icon-32.png'),
  webIcon180: path.join(root, 'public/brand/icon-180.png'),
  webIcon512: path.join(root, 'public/brand/logo.png'),
  v3Renderer: path.join(v3Root, 'src/renderer/assets'),
  v3Build: path.join(v3Root, 'build'),
}

mkdirSync(OUT.webBrand, { recursive: true })
mkdirSync(OUT.v3Renderer, { recursive: true })
mkdirSync(OUT.v3Build, { recursive: true })

/** Key out light checkerboard tiles (white + light gray). */
async function removeCheckerboard(inputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const spread = maxC - minC
    const lum = 0.299 * r + 0.587 * g + 0.114 * b

    const isNeutral = spread < 18
    const isCheckerLight = isNeutral && lum >= 168
    const isNearWhite = r > 245 && g > 245 && b > 245

    if (isCheckerLight || isNearWhite) {
      data[i + 3] = 0
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png()
}

async function main() {
  console.log('[brand] source:', SOURCE)
  const base = await removeCheckerboard(SOURCE)

  await base.clone().resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT.v3Build, 'icon.png'))
  await base.clone().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(OUT.webIcon512)
  await base.clone().resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(OUT.webIcon180)
  await base.clone().resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(OUT.webIcon32)

  const rendererLogo = path.join(OUT.v3Renderer, 'logo.png')
  copyFileSync(OUT.webIcon512, rendererLogo)

  console.log('[brand] wrote web assets →', OUT.webBrand)
  console.log('[brand] wrote v3 icon.png →', OUT.v3Build)
  console.log('[brand] wrote v3 renderer logo →', rendererLogo)
}

main().catch((err) => {
  console.error('[brand] failed:', err)
  process.exit(1)
})
