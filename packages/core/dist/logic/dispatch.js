"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchVideoProvider = dispatchVideoProvider;
/** Provider switch. Hosts inject the clients; this file does not call them. */
async function dispatchVideoProvider(provider, handlers) {
    switch (provider) {
        case 'fal':
            return handlers.fal();
        case 'runway':
            return handlers.runway();
        case 'grok':
            return handlers.grok();
        case 'replicate':
            return handlers.replicate();
        default:
            throw new Error(`Provider '${provider}' has no video client`);
    }
}
//# sourceMappingURL=dispatch.js.map