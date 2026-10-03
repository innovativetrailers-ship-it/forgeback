"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNWAY_REGISTRY = exports.RUNWAY_GEN4_TURBO = exports.RUNWAY_GEN45 = void 0;
exports.runwayDurationConstraint = runwayDurationConstraint;
exports.runwayDuration = runwayDuration;
const payload_1 = require("./payload");
/**
 * Runway duration from the Dev API reference on 2026-09-27.
 * POST /v1/image_to_video model gen4.5 — integer 2–10, required.
 * POST /v1/image_to_video model gen4_turbo — integer 2–10.
 * POST /v1/text_to_video model gen4.5 — integer 2–10, required.
 * https://docs.dev.runwayml.com/api.md
 * The wire value is a number, not a string. Example requests use 5.
 */
exports.RUNWAY_GEN45 = 'gen4.5';
exports.RUNWAY_GEN4_TURBO = 'gen4_turbo';
exports.RUNWAY_REGISTRY = 'runway-gen4';
function runwayDurationConstraint() {
    return { shape: 'range', min: 2, max: 10, wire: 'number', fallback: 5 };
}
function runwayDuration(seconds, endpoint = exports.RUNWAY_GEN45, onClamp = payload_1.logPayloadClamp) {
    return Number((0, payload_1.clampDuration)(seconds, runwayDurationConstraint(), endpoint, onClamp));
}
//# sourceMappingURL=runway.js.map