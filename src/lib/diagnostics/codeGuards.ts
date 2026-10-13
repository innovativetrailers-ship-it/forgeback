import { captureCodeError } from './captureCode'

let installed = false

export function installNodeCodeGuards(source: string): void {
  if (installed) return
  installed = true
  process.on('unhandledRejection', (reason) => {
    console.error('[code-net] unhandledRejection', reason)
    void captureCodeError({ err: reason, source: `${source}.unhandledRejection` })
  })
  process.on('uncaughtException', (err) => {
    console.error('[code-net] uncaughtException', err)
    void captureCodeError({ err, source: `${source}.uncaughtException` })
  })
}
