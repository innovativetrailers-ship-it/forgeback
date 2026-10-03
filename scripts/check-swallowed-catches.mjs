/**
 * Fail when a catch neither logs nor rethrows.
 * A comment-only body is a swallow. `// swallow-ok: <reason>` is allowed
 * only together with a log, so the exception stays visible.
 *
 * Scope: src/** and cinematic-forge-v3/src/**
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const srcRoots = [join(root, 'src'), join(root, 'cinematic-forge-v3', 'src')]

const LOG_CALL = /\b(console\.(debug|info|log|warn|error)|logCaught|logR2DeleteFailed|falLog|genLog|noteCaptureFailure|capture[A-Z][A-Za-z0-9_]*)\b/
const THROWS = /\bthrow\b|\bwrapSdkError\s*\(|\breject\b/
const SWALLOW_OK = /swallow-ok:\s*\S+/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(full)
  }
  return out
}

function skipStringOrComment(text, i) {
  const ch = text[i]
  if (ch === '/' && text[i + 1] === '/') {
    const nl = text.indexOf('\n', i)
    return nl === -1 ? text.length : nl + 1
  }
  if (ch === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2)
    return end === -1 ? text.length : end + 2
  }
  if (ch !== '"' && ch !== "'" && ch !== '`') return i
  i += 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (ch === '`' && text[i] === '$' && text[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < text.length && depth) {
        if (text[i] === '"' || text[i] === "'" || text[i] === '`' || text[i] === '/') {
          const next = skipStringOrComment(text, i)
          if (next !== i) {
            i = next
            continue
          }
        }
        if (text[i] === '{') depth += 1
        else if (text[i] === '}') depth -= 1
        i += 1
      }
      continue
    }
    if (text[i] === ch) return i + 1
    i += 1
  }
  return i
}

function matchParen(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const next = skipStringOrComment(text, i)
    if (next !== i) {
      i = next - 1
      continue
    }
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function matchBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const next = skipStringOrComment(text, i)
    if (next !== i) {
      i = next - 1
      continue
    }
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function stripComments(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim()
}

function verdict(body) {
  const logged = LOG_CALL.test(body)
  const rethrows = THROWS.test(body)
  const annotated = SWALLOW_OK.test(body)
  if (logged || rethrows) return annotated ? 'annotated' : 'ok'
  if (annotated) return 'annotated-silent'
  return 'swallow'
}

function scan(text) {
  const found = []
  for (let i = 0; i < text.length; i++) {
    const next = skipStringOrComment(text, i)
    if (next !== i) {
      i = next - 1
      continue
    }
    if (text.startsWith('catch', i) && (i === 0 || /[^A-Za-z0-9_$]/.test(text[i - 1]))) {
      if (text[i - 1] === '.') {
        let j = i + 5
        while (j < text.length && /\s/.test(text[j])) j += 1
        if (text[j] !== '(') continue
        const callClose = matchParen(text, j)
        if (callClose < 0) continue
        const innerStart = j + 1
        let k = innerStart
        while (k < callClose && /\s/.test(text[k])) k += 1
        if (text.startsWith('function', k) || text[k] === '(') {
          if (text[k] === '(') {
            const paramClose = matchParen(text, k)
            if (paramClose < 0) continue
            let a = paramClose + 1
            while (a < callClose && /\s/.test(text[a])) a += 1
            if (text.startsWith('=>', a)) {
              a += 2
              while (a < callClose && /\s/.test(text[a])) a += 1
              if (text[a] === '{') {
                const close = matchBrace(text, a)
                found.push({ index: i, open: a, close, body: text.slice(a + 1, close), kind: 'promise', head: text.slice(i, a + 1) })
                i = a
                continue
              }
              found.push({ index: i, open: a, close: callClose, body: text.slice(a, callClose), kind: 'promise-expr', head: text.slice(i, a) })
              i = a
              continue
            }
          }
        }
        found.push({ index: i, open: innerStart, close: callClose, body: text.slice(innerStart, callClose), kind: 'promise-expr', head: text.slice(i, innerStart) })
        i = innerStart
        continue
      }
      let j = i + 5
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (text[j] === '(') {
        let depth = 0
        for (; j < text.length; j++) {
          if (text[j] === '(') depth += 1
          else if (text[j] === ')') {
            depth -= 1
            if (depth === 0) {
              j += 1
              break
            }
          }
        }
        while (j < text.length && /\s/.test(text[j])) j += 1
      }
      if (text.startsWith('=>', j)) {
        j += 2
        while (j < text.length && /\s/.test(text[j])) j += 1
        if (text[j] === '{') {
          const close = matchBrace(text, j)
          if (close < 0) continue
          found.push({ index: i, open: j, close, body: text.slice(j + 1, close), kind: 'promise', head: text.slice(i, j + 1) })
          i = j
          continue
        }
        const start = j
        let depth = 0
        for (; j < text.length; j++) {
          const skipped = skipStringOrComment(text, j)
          if (skipped !== j) {
            j = skipped - 1
            continue
          }
          if (text[j] === '(' || text[j] === '[' || text[j] === '{') depth += 1
          else if (text[j] === ')' || text[j] === ']' || text[j] === '}') {
            if (depth === 0) break
            depth -= 1
          } else if (text[j] === ',' && depth === 0) break
        }
        found.push({ index: i, open: start, close: j, body: text.slice(start, j), kind: 'promise-expr', head: text.slice(i, start) })
        i = start
        continue
      }
      if (text[j] !== '{') continue
      const close = matchBrace(text, j)
      if (close < 0) continue
      const body = text.slice(j + 1, close)
      found.push({ index: i, open: j, close, body, kind: 'catch', head: text.slice(i, j + 1) })
      i = j
    }
  }
  return found
}

function paramName(head) {
  if (head.includes('=>')) {
    const match = head.match(/\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^)]*)?\)/)
    return match ? match[1] : null
  }
  const match = head.match(/\bcatch\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/)
  return match ? match[1] : null
}

function indentFor(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const spaces = text.slice(lineStart, index).match(/^\s*/)
  return `${spaces ? spaces[0] : ''}  `
}

function logStatement(name, rel, line, indent) {
  return `${indent}console.warn("[caught] ${rel}:${line}", ${name} instanceof Error ? { name: ${name}.name, message: ${name}.message } : ${name})\n`
}

function applyFixes(rel, text) {
  const blocks = scan(text).filter((block) => {
    const status = verdict(block.body)
    return status === 'swallow' || status === 'annotated-silent'
  })
  if (!blocks.length) return text
  let next = text
  for (const block of blocks.sort((a, b) => b.index - a.index)) {
    const line = lineOf(text, block.index)
    const indent = indentFor(text, block.index)
    const name = paramName(block.head) ?? 'err'
    const log = logStatement(name, rel, line, indent)
    if (block.kind === 'promise-expr') {
      let head = block.head
      if (!paramName(block.head)) head = head.replace(/\(\s*\)/, '(err)')
      const expr = block.body.trim()
      const replacement = `${head}{\n${log}${indent}return (${expr})\n${indent.slice(2)}}`
      next = next.slice(0, block.index) + replacement + next.slice(block.close)
      continue
    }
    let open = block.open
    let prefix = next.slice(0, block.index)
    let head = block.head
    if (!paramName(block.head)) {
      if (block.kind === 'promise') head = head.replace(/\(\s*\)/, '(err)')
      else head = head.replace(/\bcatch\b/, 'catch (err)')
      prefix = next.slice(0, block.index) 
      next = prefix + head + next.slice(open + 1)
      open = block.index + head.length - 1
    }
    next = next.slice(0, open + 1) + '\n' + log + next.slice(open + 1)
  }
  return next
}

const fix = process.argv.includes('--fix')
const violations = []
const annotations = []

for (const file of srcRoots.flatMap((dir) => walk(dir))) {
  const rel = relative(root, file).split('\\').join('/')
  let text = readFileSync(file, 'utf8')
  if (fix) {
    const updated = applyFixes(rel, text)
    if (updated !== text) {
      writeFileSync(file, updated)
      text = updated
    }
  }
  for (const block of scan(text)) {
    const status = verdict(block.body)
    const line = lineOf(text, block.index)
    const preview = stripComments(block.body).replace(/\s+/g, ' ').slice(0, 80)
    const row = `${rel}:${line}  ${preview || '(comment only)'}`
    if (status === 'swallow' || status === 'annotated-silent') violations.push(row)
    else if (status === 'annotated') annotations.push(row)
  }
}

if (annotations.length) {
  console.log(`check-swallowed-catches: ${annotations.length} swallow-ok annotation(s)`)
  for (const row of annotations) console.log(row)
}

if (violations.length) {
  console.error(`check-swallowed-catches: ${violations.length} swallowing catch(es)`)
  for (const row of violations) console.error(row)
  process.exit(1)
}

console.log('check-swallowed-catches: 0 swallowing catches')
