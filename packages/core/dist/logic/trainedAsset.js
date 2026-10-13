"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRAINED_LORA_DELEGATION = exports.MissingLoraPathError = exports.VOICE_SOURCES = exports.TRAINED_ASSET_TYPES = void 0;
exports.isTrainedAssetType = isTrainedAssetType;
exports.isVoiceSource = isVoiceSource;
exports.assetTypeFromTrainer = assetTypeFromTrainer;
exports.isLoraCapableEndpoint = isLoraCapableEndpoint;
exports.loraCapableEndpoints = loraCapableEndpoints;
exports.isVideoLoraEndpoint = isVideoLoraEndpoint;
exports.endpointAcceptsAsset = endpointAcceptsAsset;
exports.loraEndpointForMode = loraEndpointForMode;
exports.applyLoraPass = applyLoraPass;
exports.loraInferenceModelDef = loraInferenceModelDef;
exports.emptyLearnedCell = emptyLearnedCell;
exports.shouldDelegateTrainedLora = shouldDelegateTrainedLora;
const trainerRegistry_1 = require("./trainerRegistry");
const learn_1 = require("./learn");
exports.TRAINED_ASSET_TYPES = ['character', 'style', 'audio_style'];
exports.VOICE_SOURCES = ['cloned', 'designed'];
const VIDEO_LORA_KINDS = new Set([
    'text',
    'first_frame',
    'reference',
    'video_edit',
]);
function isTrainedAssetType(value) {
    return exports.TRAINED_ASSET_TYPES.includes(value);
}
function isVoiceSource(value) {
    return exports.VOICE_SOURCES.includes(value);
}
function assetTypeFromTrainer(trains) {
    if (trains === 'character')
        return 'character';
    if (trains === 'audio_style')
        return 'audio_style';
    return 'style';
}
function isLoraCapableEndpoint(endpoint) {
    return Boolean((0, trainerRegistry_1.loraInferenceDef)(endpoint));
}
function loraCapableEndpoints() {
    return Object.keys(trainerRegistry_1.LORA_INFERENCE_REGISTRY);
}
function isVideoLoraEndpoint(endpoint) {
    const def = (0, trainerRegistry_1.loraInferenceDef)(endpoint);
    return Boolean(def && VIDEO_LORA_KINDS.has(def.kind));
}
function endpointAcceptsAsset(endpoint, asset) {
    if (!(0, trainerRegistry_1.loraPassFor)(endpoint) || !asset.loraUrl?.trim())
        return false;
    const inference = asset.loraInference?.trim();
    if (!inference)
        return true;
    if (inference === endpoint)
        return true;
    const here = (0, trainerRegistry_1.loraInferenceDef)(endpoint);
    const src = (0, trainerRegistry_1.loraInferenceDef)(inference);
    if (here && src && here.base === src.base)
        return true;
    return Object.values(trainerRegistry_1.TRAINER_REGISTRY).some((row) => row.loraInference === inference && row.crossMode?.includes(endpoint));
}
function kindForMode(mode) {
    if (mode === 'text')
        return 'text';
    if (mode === 'first_frame' || mode === 'first_last')
        return 'first_frame';
    if (mode === 'reference')
        return 'reference';
    if (mode === 'video_edit')
        return 'video_edit';
    return null;
}
class MissingLoraPathError extends Error {
    constructor(endpoint) {
        super(`No LoRA inference path for ${endpoint}. The trained asset was not applied.`);
        this.name = 'MissingLoraPathError';
    }
}
exports.MissingLoraPathError = MissingLoraPathError;
function loraEndpointForMode(asset, mode) {
    const inference = asset.loraInference?.trim();
    if (!inference || !asset.loraUrl?.trim())
        return null;
    const wanted = kindForMode(mode);
    const candidates = new Set([inference]);
    const src = (0, trainerRegistry_1.loraInferenceDef)(inference);
    if (src) {
        for (const row of Object.values(trainerRegistry_1.LORA_INFERENCE_REGISTRY)) {
            if (row.base === src.base)
                candidates.add(row.id);
        }
    }
    const trainer = Object.values(trainerRegistry_1.TRAINER_REGISTRY).find((row) => row.loraInference === inference);
    const mechanism = trainer ? (0, trainerRegistry_1.loraMechanism)(trainer) : null;
    if (mechanism)
        candidates.add(mechanism.endpoint);
    for (const id of trainer?.crossMode ?? [])
        candidates.add(id);
    if (wanted) {
        for (const id of candidates) {
            const def = (0, trainerRegistry_1.loraInferenceDef)(id);
            if (def && def.kind === wanted && isVideoLoraEndpoint(id))
                return id;
        }
    }
    return isVideoLoraEndpoint(inference) ? inference : null;
}
function loraItem(pass, asset) {
    const item = {
        [pass.itemPath]: asset.loraUrl.trim(),
        [pass.itemScale]: asset.scale ?? 1,
    };
    if (pass.itemTarget)
        item[pass.itemTarget] = 'self';
    return item;
}
function applyLoraPass(endpoint, payload, promptKey, assets, properties) {
    if (!assets.length)
        return;
    const pass = (0, trainerRegistry_1.loraPassFor)(endpoint);
    if (!pass)
        throw new MissingLoraPathError(endpoint);
    const props = properties ? new Set(properties) : null;
    if (props && !props.has(pass.field))
        throw new MissingLoraPathError(endpoint);
    const usable = assets.filter((asset) => endpointAcceptsAsset(endpoint, asset));
    if (!usable.length)
        throw new MissingLoraPathError(endpoint);
    payload[pass.field] = usable.map((asset) => loraItem(pass, asset));
    if (!pass.triggerInPrompt)
        return;
    const current = String(payload[promptKey] ?? '');
    const missing = usable
        .map((asset) => asset.triggerPhrase?.trim())
        .filter((phrase) => Boolean(phrase))
        .filter((phrase) => !current.includes(phrase));
    if (!missing.length)
        return;
    payload[promptKey] = `${missing.join(', ')}, ${current}`.replace(/^, /, '');
}
const LORA_CONTROL = {
    referenceClass: 'true_reference',
    maxReferenceImages: 4,
    firstLastFrame: true,
    cameraControl: 'prompt_only',
    motionBrush: false,
    nativeAudio: false,
};
function endpointsForLoraBase(base) {
    const out = {};
    for (const row of Object.values(trainerRegistry_1.LORA_INFERENCE_REGISTRY)) {
        if (row.base !== base)
            continue;
        if (row.kind === 'text')
            out.text = row.id;
        if (row.kind === 'first_frame') {
            out.first_frame = row.id;
            out.first_last = row.id;
        }
        if (row.kind === 'reference')
            out.reference = row.id;
        if (row.kind === 'video_edit')
            out.video_edit = row.id;
    }
    return out;
}
/** Resolvable ModelDef for a verified /lora inference id. Not a council pool member. */
function loraInferenceModelDef(id) {
    const inf = (0, trainerRegistry_1.loraInferenceDef)(id);
    if (!inf)
        return undefined;
    const endpoints = endpointsForLoraBase(inf.base);
    const i2v = endpoints.first_frame;
    const reference = endpoints.reference;
    return {
        id: inf.id,
        provider: 'fal',
        endpoint: inf.id,
        i2vEndpoint: i2v,
        role: 'LORA',
        tier: 'studio',
        costPer5s: 0,
        silentOnly: true,
        pinned: true,
        canonicalId: inf.id,
        falEndpoint: inf.id,
        isExternal: false,
        supportsSeed: true,
        supportsCharRef: inf.kind === 'reference' || inf.kind === 'first_frame',
        referenceEndpoint: reference,
        control: {
            ...LORA_CONTROL,
            referenceClass: inf.kind === 'reference'
                ? 'true_reference'
                : inf.kind === 'first_frame'
                    ? 'first_frame'
                    : 'none',
            maxReferenceImages: inf.kind === 'reference' ? 4 : inf.kind === 'first_frame' ? 1 : 0,
        },
        endpoints,
    };
}
function emptyLearnedCell() {
    return { worked: 0, total: 0, score: 0.5 };
}
function shouldDelegateTrainedLora(input) {
    if (input.modelOverride?.trim())
        return false;
    if (!input.hasLoraAsset || !input.loraEndpoint)
        return false;
    if (input.assetType === 'audio_style')
        return false;
    if (input.assetType !== 'style') {
        if (input.purpose !== 'consistency' && (input.consistencyNeed ?? 0) < 6)
            return false;
    }
    const cell = input.learned?.[input.loraEndpoint]?.consistency ?? emptyLearnedCell();
    if (cell.total > 0 && (0, learn_1.isCircuitOpen)(cell))
        return false;
    return isVideoLoraEndpoint(input.loraEndpoint);
}
exports.TRAINED_LORA_DELEGATION = 'using trained LoRA for consistency';
//# sourceMappingURL=trainedAsset.js.map