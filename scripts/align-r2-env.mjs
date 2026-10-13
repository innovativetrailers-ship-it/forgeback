import { readFileSync, writeFileSync } from 'node:fs'

function load(path) {
  const out = {}
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      out[match[1]] = value
    }
  } catch { /* optional */ }
  return out
}

const raw = readFileSync(0, 'utf8')
const remote = JSON.parse(raw)
const keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL']
const local = { ...load('.env'), ...load('.env.local') }
const fields = {}
for (const key of keys) {
  const left = local[key] ?? ''
  const right = remote[key] ?? ''
  fields[key] = !left && !right ? 'missing-both' : left === right ? 'match' : !right ? 'remote-missing' : !left ? 'local-missing' : 'differ'
}
console.log(JSON.stringify({
  buckets: { local: local.R2_BUCKET_NAME || null, remote: remote.R2_BUCKET_NAME || null },
  fields,
}))

let text = ''
try { text = readFileSync('.env', 'utf8') } catch { text = '' }
const changed = []
for (const key of keys) {
  if (!remote[key] || local[key] === remote[key]) continue
  const line = `${key}=${remote[key]}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(text)) text = text.replace(pattern, line)
  else text += (text.endsWith('\n') || text.length === 0 ? '' : '\n') + line + '\n'
  changed.push(key)
}
if (changed.length) {
  writeFileSync('.env', text.endsWith('\n') ? text : text + '\n')
  console.log('updated ' + changed.join(','))
} else {
  console.log('updated none')
}
