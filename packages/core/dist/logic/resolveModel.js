"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelResolveError = void 0;
exports.normaliseModelId = normaliseModelId;
exports.falBaseApp = falBaseApp;
exports.modelAcceptsEndFrame = modelAcceptsEndFrame;
exports.modelSupportsSeed = modelSupportsSeed;
exports.modelSupportsCharRef = modelSupportsCharRef;
exports.resolveModel = resolveModel;
exports.assertModelsResolvable = assertModelsResolvable;
exports.resolveReferenceEndpoint = resolveReferenceEndpoint;
exports.stillHold = stillHold;
exports.resolveVideoEndpoint = resolveVideoEndpoint;
const registry_1 = require("./registry");
const trainedAsset_1 = require("./trainedAsset");
const kling_1 = require("./kling");
const seedance_1 = require("./seedance");
const veo_1 = require("./veo");
const wan_1 = require("./wan");
const wan30_1 = require("./wan30");
const grok_1 = require("./grok");
const pixverse_1 = require("./pixverse");
const happyhorse_1 = require("./happyhorse");
const ltx_1 = require("./ltx");
const hailuo_1 = require("./hailuo");
const omni_1 = require("./omni");
class ModelResolveError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ModelResolveError';
    }
}
exports.ModelResolveError = ModelResolveError;
const LEGACY_IDS = {
    'kling-pro': 'kling-3.0',
    'kling-standard': 'kling-3.0',
    kling: 'kling-3.0',
    veo3: 'veo-3.1',
    'veo-3': 'veo-3.1',
    'veo3.1': 'veo-3.1',
    'veo-3-1': 'veo-3.1',
    seedance: 'seedance-2.0',
    ltx: 'ltx-2.3-fast',
    'ltx-2.3': 'ltx-2.3-fast',
    'ltx-fast': 'ltx-2.3-fast',
    runway: 'runway-gen4',
    'runway-gen4.5': 'runway-gen4',
    'gen4.5': 'runway-gen4',
    'gen-4.5': 'runway-gen4',
    'gen-4-5': 'runway-gen4',
    grok: 'grok-imagine-video',
    'grok-imagine': 'grok-imagine-video',
    imagine: 'grok-imagine-video',
    'grok-video': 'grok-imagine-video',
    animatediff: 'ltx-2.3-fast',
    omni: 'gemini-omni',
    'gemini-omni-flash': 'gemini-omni',
    'omni-flash': 'gemini-omni',
    'gemini-omni-flash-1.1': 'gemini-omni',
};
function normaliseModelId(id) {
    if (!id?.trim()) {
        throw new Error('normaliseModelId: model id is required — cannot default to a fallback model');
    }
    return LEGACY_IDS[id] ?? id;
}
function falBaseApp(endpoint) {
    return endpoint.split('/').slice(0, 2).join('/');
}
function toModelDef(id, entry) {
    const provider = (0, registry_1.entryProvider)(id, entry);
    const mode = id === 'seedance-2.0'
        ? (0, seedance_1.seedanceModeModel)()
        : id === 'kling-3.0'
            ? (0, kling_1.klingModeModel)()
            : id === 'veo-3.1'
                ? (0, veo_1.veoModeModel)()
                : id === 'wan-2.7'
                    ? (0, wan_1.wanModeModel)()
                    : id === 'wan-3.0'
                        ? (0, wan30_1.wan30ModeModel)()
                        : id === 'grok-imagine-video'
                            ? (0, grok_1.grokModeModel)()
                            : id === 'pixverse-v5.6'
                                ? (0, pixverse_1.pixverseModeModel)()
                                : id === 'happyhorse-1.0'
                                    ? (0, happyhorse_1.happyhorseModeModel)()
                                    : id === 'ltx-2.3-fast'
                                        ? (0, ltx_1.ltxModeModel)()
                                        : id === 'hailuo-02'
                                            ? (0, hailuo_1.hailuoModeModel)()
                                            : id === 'gemini-omni'
                                                ? (0, omni_1.omniModeModel)()
                                                : undefined;
    return {
        id,
        provider,
        endpoint: entry.falEndpoint,
        i2vEndpoint: entry.i2vEndpoint,
        role: (0, registry_1.modelRole)(id),
        tier: (0, registry_1.modelTier)(id),
        costPer5s: 0,
        silentOnly: id !== 'grok-imagine-video',
        pinned: true,
        canonicalId: normaliseModelId(id),
        falEndpoint: entry.falEndpoint,
        isExternal: provider !== 'fal',
        supportsSeed: entry.supportsSeed,
        supportsCharRef: entry.supportsCharRef,
        referenceEndpoint: entry.referenceEndpoint,
        control: entry.control,
        endpoints: mode?.endpoints,
        fields: mode?.fields,
        limits: mode?.limits,
    };
}
function modelAcceptsEndFrame(id) {
    try {
        return resolveModel(id).control.firstLastFrame;
    }
    catch {
        return false;
    }
}
function modelSupportsSeed(def) {
    return def.supportsSeed;
}
function modelSupportsCharRef(def) {
    return def.supportsCharRef;
}
function resolveModel(id) {
    const trimmed = id.trim();
    const canon = normaliseModelId(trimmed.toLowerCase().replace(/[_\s]+/g, '-'));
    const lora = (0, trainedAsset_1.loraInferenceModelDef)(trimmed) ?? (0, trainedAsset_1.loraInferenceModelDef)(canon);
    if (lora)
        return lora;
    const aliasTarget = registry_1.MODEL_REGISTRY_ALIASES[canon];
    const key = registry_1.VIDEO_MODEL_REGISTRY[canon] ? canon : aliasTarget;
    const entry = key ? registry_1.VIDEO_MODEL_REGISTRY[key] : undefined;
    if (!entry) {
        throw new ModelResolveError(`Unknown model '${id}' (canonical '${canon}'). Known: ${Object.keys(registry_1.VIDEO_MODEL_REGISTRY).join(', ')}`);
    }
    const provider = (0, registry_1.entryProvider)(key, entry);
    if (provider === 'elevenlabs' || provider === 'suno') {
        throw new ModelResolveError(`Model '${id}' is an audio provider — use the audio pipeline, not video dispatch`);
    }
    if (provider === 'fal' && !entry.falEndpoint) {
        throw new ModelResolveError(`Model '${canon}' has no FAL endpoint mapping`);
    }
    return toModelDef(key, entry);
}
function assertModelsResolvable(modelIds) {
    for (const id of modelIds)
        resolveModel(id);
}
function resolveReferenceEndpoint(registryModel) {
    return resolveModel(registryModel).referenceEndpoint;
}
/** reference-to-video, else a distinct image-to-video endpoint, else the model cannot hold a still. */
function stillHold(id) {
    try {
        const def = resolveModel(id);
        if (def.referenceEndpoint)
            return 'reference';
        if (def.i2vEndpoint && def.i2vEndpoint !== def.falEndpoint)
            return 'first_frame';
        return null;
    }
    catch {
        return null;
    }
}
function resolveVideoEndpoint(registryModel, hasStartFrame) {
    const def = resolveModel(registryModel);
    if (def.isExternal)
        return def.falEndpoint;
    if (hasStartFrame && def.i2vEndpoint && def.i2vEndpoint !== def.falEndpoint) {
        return def.i2vEndpoint;
    }
    return def.falEndpoint;
}
//# sourceMappingURL=resolveModel.js.map