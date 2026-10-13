"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayloadError = exports.AUDIO_TOGGLE_FIELDS = void 0;
exports.clampDuration = clampDuration;
exports.silenceVideoAudio = silenceVideoAudio;
exports.logPayloadClamp = logPayloadClamp;
exports.snapEnum = snapEnum;
exports.buildPayload = buildPayload;
const identity_1 = require("./identity");
const trainedAsset_1 = require("./trainedAsset");
function clampDuration(seconds, constraint, endpoint, onClamp) {
    const invalid = seconds == null || !Number.isFinite(seconds) || seconds <= 0;
    if (constraint.shape === 'range') {
        const target = invalid ? constraint.fallback : Math.round(seconds);
        const picked = Math.min(constraint.max, Math.max(constraint.min, target));
        const wire = constraint.wire === 'string' ? String(picked) : picked;
        onClamp?.('duration', seconds, wire, endpoint);
        return wire;
    }
    const target = invalid ? constraint.fallback : Math.round(seconds);
    let best = constraint.values[0];
    let distance = Infinity;
    for (const value of constraint.values) {
        const n = Number(value);
        if (!Number.isFinite(n))
            continue;
        const gap = Math.abs(n - target);
        if (gap < distance || (gap === distance && n > Number(best))) {
            distance = gap;
            best = value;
        }
    }
    onClamp?.('duration', seconds, best, endpoint);
    return best;
}
/** Audio toggles seen on FAL video schemas. Off value is boolean false. */
exports.AUDIO_TOGGLE_FIELDS = [
    'generate_audio',
    'audio_enabled',
    'enable_audio',
    'generate_audio_switch',
    'with_audio',
];
/**
 * Force every known audio toggle off.
 * Veo 3.1's published input field is generate_audio (default true). The local
 * constraint seed has no Veo OpenAPI document, so Veo always sets that field
 * even when the cached property list omitted it.
 */
function silenceVideoAudio(endpoint, payload, properties, nativeAudio = false) {
    if (nativeAudio)
        return [];
    const props = new Set(properties ?? []);
    const silenced = [];
    for (const field of exports.AUDIO_TOGGLE_FIELDS) {
        if (props.has(field) || Object.prototype.hasOwnProperty.call(payload, field)) {
            payload[field] = false;
            silenced.push(field);
        }
    }
    if (/veo/i.test(endpoint) && !silenced.includes('generate_audio')) {
        payload.generate_audio = false;
        silenced.push('generate_audio');
    }
    if (/seedance/i.test(endpoint) && !silenced.includes('generate_audio')) {
        payload.generate_audio = false;
        silenced.push('generate_audio');
    }
    return silenced;
}
const RESOLUTION_RANK = ['480p', '580p', '720p', '1080p', '1440p', '2160p'];
function normalizeResolution(value) {
    const v = value.trim().toLowerCase();
    if (/^\d+p$/i.test(v))
        return v;
    if (/^\d+k$/i.test(v))
        return v.replace(/k$/i, 'p');
    return v;
}
/** Single duration-clamp log. Family snaps and buildPayload's onClamp both call this. */
function logPayloadClamp(field, from, to, endpoint, shotId) {
    if (String(from) === String(to))
        return;
    console.log('[payload_clamped]', JSON.stringify({
        shotId: shotId ?? null,
        model: endpoint,
        field,
        from,
        to,
    }));
}
function snapEnum(field, want, allowed, endpoint, onClamp) {
    if (allowed.includes(want))
        return want;
    if (typeof allowed[0] === 'number') {
        const target = Number(want);
        const picked = allowed.reduce((a, b) => Math.abs(Number(b) - target) < Math.abs(Number(a) - target) ? b : a);
        onClamp?.(field, want, picked, endpoint);
        return picked;
    }
    const wi = RESOLUTION_RANK.indexOf(normalizeResolution(String(want)));
    const allowedStr = allowed;
    const picked = (wi >= 0
        ? allowedStr
            .filter((r) => {
            const ri = RESOLUTION_RANK.indexOf(normalizeResolution(r));
            return ri >= 0 && ri <= wi;
        })
            .sort((a, b) => RESOLUTION_RANK.indexOf(normalizeResolution(b)) -
            RESOLUTION_RANK.indexOf(normalizeResolution(a)))[0]
        : undefined) ?? allowedStr[0];
    onClamp?.(field, want, picked, endpoint);
    return picked;
}
function coerce(value, type) {
    if (type === 'string')
        return String(value);
    if (type === 'number')
        return Number(value);
    if (type === 'boolean')
        return Boolean(value);
    return value;
}
function pickProperty(candidates, properties) {
    return candidates.find((k) => properties.has(k));
}
function mapQualityToResolution(quality) {
    if (!quality)
        return '720p';
    const q = quality.toLowerCase();
    if (q === 'film' || q === 'film_grade' || q === 'cinematic' || q === '1080p')
        return '1080p';
    return '720p';
}
class PayloadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PayloadError';
    }
}
exports.PayloadError = PayloadError;
/**
 * Schema-driven payload. The host fetches and caches ModelConstraints, then
 * passes them in. This function does not fetch.
 */
function buildPayload(endpoint, shot, constraints, options) {
    const props = new Set(constraints.properties ?? Object.keys(constraints.types));
    const p = {};
    const promptKey = pickProperty(['prompt', 'text', 'prompt_text'], props) ?? 'prompt';
    const rawPrompt = shot.prompt.trim();
    if (!rawPrompt) {
        const label = shot.shotIndex == null ? 'shot' : `shot ${shot.shotIndex}`;
        throw new PayloadError(`${label} has no prompt`);
    }
    p[promptKey] = rawPrompt;
    (0, trainedAsset_1.applyLoraPass)(endpoint, p, promptKey, [shot.characterLora, shot.styleLora, shot.audioLora].filter((asset) => Boolean(asset?.loraUrl)), props);
    const maxPromptChars = constraints.maxPromptChars;
    let promptText = String(p[promptKey] ?? '');
    if (maxPromptChars && promptText.length > maxPromptChars) {
        promptText = (0, identity_1.capPromptText)(promptText, maxPromptChars);
        options?.onClamp?.('prompt', rawPrompt.length, promptText.length, endpoint);
        p[promptKey] = promptText;
    }
    const durationKey = pickProperty(['duration', 'seconds', 'video_length'], props);
    const durationConstraint = options?.durationConstraint;
    if (durationKey) {
        p[durationKey] = durationConstraint
            ? clampDuration(shot.duration, durationConstraint, endpoint, options?.onClamp)
            : shot.duration;
    }
    const aspectKey = pickProperty(['aspect_ratio', 'ratio'], props);
    if (aspectKey && shot.aspectRatio)
        p[aspectKey] = shot.aspectRatio;
    const resolutionKey = pickProperty(['resolution'], props);
    if (resolutionKey) {
        p[resolutionKey] = shot.resolution ?? mapQualityToResolution(shot.quality);
    }
    const imageUrl = shot.anchorUrl ?? shot.imageUrl;
    if (imageUrl) {
        const imageKey = pickProperty(['image_url', 'image', 'init_image', 'start_image', 'start_image_url'], props);
        if (imageKey)
            p[imageKey] = imageUrl;
    }
    if (shot.negativePrompt && props.has('negative_prompt')) {
        p.negative_prompt = shot.negativePrompt;
    }
    if (shot.seed !== undefined && props.has('seed')) {
        p.seed = shot.seed;
    }
    if (constraints.audioField && props.has(constraints.audioField)) {
        p[constraints.audioField] = false;
    }
    const enums = { ...constraints.enums };
    if (durationConstraint && durationKey)
        delete enums[durationKey];
    for (const [field, allowed] of Object.entries(enums)) {
        if (field in p)
            p[field] = snapEnum(field, p[field], allowed, endpoint, options?.onClamp);
    }
    for (const [field, type] of Object.entries(constraints.types)) {
        if (field in p && p[field] != null)
            p[field] = coerce(p[field], type);
    }
    for (const key of constraints.forbidden) {
        if (exports.AUDIO_TOGGLE_FIELDS.includes(key))
            continue;
        delete p[key];
    }
    for (const field of silenceVideoAudio(endpoint, p, props, options?.nativeAudio === true)) {
        options?.onAudioDisabled?.(field, endpoint);
    }
    (0, trainedAsset_1.applyLoraPass)(endpoint, p, promptKey, [shot.characterLora, shot.styleLora, shot.audioLora].filter((asset) => Boolean(asset?.loraUrl)), props);
    for (const key of constraints.required) {
        if (p[key] == null)
            throw new PayloadError(`${endpoint} requires ${key}`);
    }
    return p;
}
//# sourceMappingURL=payload.js.map