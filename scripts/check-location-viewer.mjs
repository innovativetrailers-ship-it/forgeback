import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/app/location/aerial/page.tsx', import.meta.url), 'utf8')
const failures = []
if (/createWorldTerrain\s*\(/.test(page)) {
  failures.push('aerial page still calls createWorldTerrain(), which is not a function in Cesium 1.113')
}
if (!page.includes('createWorldTerrainAsync')) failures.push('aerial page does not call createWorldTerrainAsync')
if (!page.includes('2D satellite view')) failures.push('aerial page has no 2D satellite fallback')
if (!page.includes('3D tiles unavailable')) failures.push('aerial page has no visible failure reason')
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('check-location-viewer: 0')
