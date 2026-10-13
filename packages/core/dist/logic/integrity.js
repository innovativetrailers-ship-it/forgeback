"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelIntegrityError = void 0;
exports.assertModelIntegrity = assertModelIntegrity;
const trainerRegistry_1 = require("./trainerRegistry");
const resolveModel_1 = require("./resolveModel");
class ModelIntegrityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ModelIntegrityError';
    }
}
exports.ModelIntegrityError = ModelIntegrityError;
function assertModelIntegrity(selectedId, def, endpoint, hasStartFrame = false, hasCharacterRefs = false) {
    const expected = (0, resolveModel_1.resolveModel)(selectedId);
    if (expected.canonicalId !== def.canonicalId) {
        throw new ModelIntegrityError(`Model substitution detected: user selected '${selectedId}' ` +
            `(canonical ${expected.canonicalId}) but dispatch resolved '${def.canonicalId}'.`);
    }
    if (def.provider !== 'fal')
        return;
    if ((0, trainerRegistry_1.loraInferenceDef)(expected.canonicalId) || (0, trainerRegistry_1.loraInferenceDef)(endpoint)) {
        const allowed = new Set([
            expected.falEndpoint,
            expected.i2vEndpoint,
            expected.referenceEndpoint,
            ...Object.values(expected.endpoints ?? {}),
        ].filter((value) => Boolean(value)));
        if (allowed.has(endpoint))
            return;
    }
    if (hasCharacterRefs && def.referenceEndpoint && endpoint === def.referenceEndpoint)
        return;
    const modeEndpoint = def.endpoints?.first_last === endpoint || def.endpoints?.video_edit === endpoint;
    if (modeEndpoint)
        return;
    const expectedEndpoint = (0, resolveModel_1.resolveVideoEndpoint)(expected.canonicalId, hasStartFrame);
    if (!expectedEndpoint) {
        throw new ModelIntegrityError(`Model '${selectedId}' has no FAL endpoint mapping`);
    }
    if (endpoint !== expectedEndpoint) {
        throw new ModelIntegrityError(`Model substitution detected: user selected '${selectedId}' ` +
            `(endpoint ${expectedEndpoint}) but about to submit ${endpoint}. Refusing — no silent swaps.`);
    }
}
//# sourceMappingURL=integrity.js.map