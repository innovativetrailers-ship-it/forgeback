"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIKA_DURATION = exports.PIKA_IMAGE = exports.PIKA_TEXT = void 0;
exports.pikaDurationConstraint = pikaDurationConstraint;
exports.pikaDuration = pikaDuration;
const payload_1 = require("./payload");
/**
 * Pika 2.2 duration from OpenAPI on 2026-09-26.
 * fal-ai/pika/v2.2/text-to-video — integer enum [5, 10], default 5.
 */
exports.PIKA_TEXT = 'fal-ai/pika/v2.2/text-to-video';
exports.PIKA_IMAGE = 'fal-ai/pika/v2.2/image-to-video';
exports.PIKA_DURATION = [5, 10];
function pikaDurationConstraint() {
    return { shape: 'set', values: exports.PIKA_DURATION, fallback: 5 };
}
function pikaDuration(seconds, endpoint = exports.PIKA_TEXT, onClamp = payload_1.logPayloadClamp) {
    return Number((0, payload_1.clampDuration)(seconds, pikaDurationConstraint(), endpoint, onClamp));
}
//# sourceMappingURL=pika.js.map