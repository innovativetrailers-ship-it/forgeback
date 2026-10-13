"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.familyDurationConstraint = familyDurationConstraint;
exports.durationEnumFromConstraint = durationEnumFromConstraint;
const kling_1 = require("./kling");
const ltx_1 = require("./ltx");
const pika_1 = require("./pika");
const runway_1 = require("./runway");
const wan_1 = require("./wan");
/** The duration constraint the seal uses. The clamp must call this, not a stored enum. */
function familyDurationConstraint(endpoint) {
    if (endpoint.includes('kling-video'))
        return (0, kling_1.klingDurationConstraint)(endpoint);
    if (endpoint.includes('ltx-2.3'))
        return (0, ltx_1.ltxDurationConstraint)(endpoint.includes('/fast'));
    if (endpoint.includes('/wan/v2.7/'))
        return (0, wan_1.wanDurationConstraint)(endpoint.includes('reference-to-video'));
    if (endpoint.includes('/pika/'))
        return (0, pika_1.pikaDurationConstraint)();
    if (endpoint.includes('runway') || endpoint === 'gen4.5' || endpoint === 'gen4_turbo') {
        return (0, runway_1.runwayDurationConstraint)();
    }
    return null;
}
function durationEnumFromConstraint(constraint) {
    if (constraint.shape === 'set')
        return [...constraint.values];
    const values = [];
    for (let n = constraint.min; n <= constraint.max; n += 1) {
        values.push(constraint.wire === 'string' ? String(n) : n);
    }
    return values;
}
//# sourceMappingURL=familyDuration.js.map