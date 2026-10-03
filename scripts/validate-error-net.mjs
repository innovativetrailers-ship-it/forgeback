/**
 * ADX-1: error interpretation rule map. No FAL submit.
 */
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const core = requireCore(path.join(path.dirname(fileURLToPath(import.meta.url)), '../packages/core/dist/index.js'))

function fail(label, detail) {
  console.log('FAIL', label, detail)
  process.exitCode = 1
}

const content = core.interpretErrorRules('Safety checker flagged this prompt as NSFW', 422)
if (content.category !== 'content_flag' || content.suggestedAction !== 'alter_prompt') fail('content flag', content)
else console.log('PASS content checker → content_flag / alter_prompt')

const limit = core.interpretErrorRules('should have at most 4 items', 422)
if (limit.category !== 'payload_over_limit' || !limit.correctable) fail('over limit', limit)
else console.log('PASS at most N → payload_over_limit correctable')

const field = core.interpretErrorRules('Input should be a valid string', 422)
if (field.category !== 'field_mismatch') fail('field', field)
else console.log('PASS field required → field_mismatch')

const missing = core.interpretErrorRules('Not Found', 404)
if (missing.category !== 'namespace_bad') fail('404', missing)
else console.log('PASS 404 → namespace_bad')

const transient = core.interpretErrorRules('upstream timeout', 503)
if (transient.category !== 'provider_transient') fail('5xx', transient)
else console.log('PASS 5xx/timeout → provider_transient')

const auth = core.interpretErrorRules('Invalid API key for workspace', 401)
if (auth.category !== 'auth_config') fail('auth', auth)
else console.log('PASS api key → auth_config')

const mode = core.interpretErrorRules('image_url is mutually exclusive with this mode')
if (mode.category !== 'unsupported_mode') fail('mode', mode)
else console.log('PASS mutually exclusive → unsupported_mode')

const a = core.normalizeErrorSignature('https://queue.fal.run/abc request 123e4567-e89b-12d3-a456-426614174000 failed')
const b = core.normalizeErrorSignature('https://cdn.fal.ai/xyz request 123e4567-e89b-12d3-a456-426614174000 failed')
if (a !== b) fail('signature', { a, b })
else console.log('PASS signature strips urls and ids')

if (core.providerBodyText({ detail: 'Safety checker flagged' }) !== 'Safety checker flagged') {
  fail('body text', core.providerBodyText({ detail: 'Safety checker flagged' }))
} else console.log('PASS provider body detail retained')

const logs = core.collectProviderLogs({
  logs: [{ message: 'Safety checker flagged' }, { msg: 'NSFW prob 0.9' }, 'queue tick'],
})
if (logs.length !== 3 || !logs[0].includes('Safety checker')) fail('provider logs', logs)
else console.log('PASS with_logs lines collected from provider body')

const logged = core.urlWithProviderLogs('https://queue.fal.run/x/requests/1/status')
if (!logged.includes('logs=1')) fail('logs query', logged)
else console.log('PASS status URL requests with_logs')

if (process.exitCode) process.exit(process.exitCode)
console.log('error net inspected; generation not run')
