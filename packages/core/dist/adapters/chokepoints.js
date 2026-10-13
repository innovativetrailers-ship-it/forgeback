"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaidCallRefusedError = exports.GenerationPausedError = void 0;
exports.generationPausedFromEnv = generationPausedFromEnv;
exports.requireCallerSource = requireCallerSource;
class GenerationPausedError extends Error {
    code = 'GENERATION_PAUSED';
    constructor(message) {
        super(message);
        this.name = 'GenerationPausedError';
    }
}
exports.GenerationPausedError = GenerationPausedError;
class PaidCallRefusedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaidCallRefusedError';
    }
}
exports.PaidCallRefusedError = PaidCallRefusedError;
/** Shared pause predicate. Omitted or any value other than false/0/off means paused. */
function generationPausedFromEnv(value) {
    if (value === 'false' || value === '0' || value?.toLowerCase() === 'off')
        return false;
    return true;
}
/** Every paid call must name its caller. Hosts throw their own error type around this. */
function requireCallerSource(source) {
    const caller = source?.trim() ?? '';
    if (!caller || caller === 'UNKNOWN') {
        throw new PaidCallRefusedError('Paid call with no caller source — refusing');
    }
    return caller;
}
//# sourceMappingURL=chokepoints.js.map