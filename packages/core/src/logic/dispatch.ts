import type { Provider } from '../types/provider'

export interface VideoProviderHandlers {
  fal: () => Promise<string>
  runway: () => Promise<string>
  grok: () => Promise<string>
  replicate: () => Promise<string>
}

/** Provider switch. Hosts inject the clients; this file does not call them. */
export async function dispatchVideoProvider(
  provider: Provider,
  handlers: VideoProviderHandlers,
): Promise<string> {
  switch (provider) {
    case 'fal':
      return handlers.fal()
    case 'runway':
      return handlers.runway()
    case 'grok':
      return handlers.grok()
    case 'replicate':
      return handlers.replicate()
    default:
      throw new Error(`Provider '${provider}' has no video client`)
  }
}
