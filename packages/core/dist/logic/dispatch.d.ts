import type { Provider } from '../types/provider';
export interface VideoProviderHandlers {
    fal: () => Promise<string>;
    runway: () => Promise<string>;
    grok: () => Promise<string>;
    replicate: () => Promise<string>;
}
/** Provider switch. Hosts inject the clients; this file does not call them. */
export declare function dispatchVideoProvider(provider: Provider, handlers: VideoProviderHandlers): Promise<string>;
