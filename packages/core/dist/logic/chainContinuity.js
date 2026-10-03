"use strict";
/**
 * Chained continuity. A shot feeds the previous shot's video forward only when
 * the scene continues, the model accepts a video reference, and the shot is
 * worth the sequential wait.
 * Wan 3.0 reference-to-video (OpenAPI 200): reference_video_urls max 5, described
 * as totaling at most 15 seconds. Duration is an integer 2-30. That input has no
 * start_image_url or end_image_url. The fed clip stays 3 seconds, inside the 15s
 * cap, and output is clamped so clip + output stays within 30.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_REFERENCE_MODELS = exports.CONTINUITY_SCORE_MIN = exports.CONTINUITY_MODEL_ID = exports.CHAIN_REGEN_LIMIT = exports.WAN30_OUTPUT_MAX = exports.WAN30_OUTPUT_MIN = exports.WAN30_REF_VIDEO_MAX_SECONDS = exports.CHAIN_CLIP_SECONDS = void 0;
exports.isVideoReferenceCapable = isVideoReferenceCapable;
exports.continuityPriorityFor = continuityPriorityFor;
exports.shouldChain = shouldChain;
exports.chainLink = chainLink;
exports.shotContinuityFlag = shotContinuityFlag;
exports.chainModelChoice = chainModelChoice;
exports.partitionContinuity = partitionContinuity;
exports.wanChainOutputSeconds = wanChainOutputSeconds;
exports.gateChainLink = gateChainLink;
exports.CHAIN_CLIP_SECONDS = 3;
exports.WAN30_REF_VIDEO_MAX_SECONDS = 15;
exports.WAN30_OUTPUT_MIN = 2;
exports.WAN30_OUTPUT_MAX = 30;
exports.CHAIN_REGEN_LIMIT = 1;
/** Reference-to-video model for a continuous link. Wave 4 swaps this one line to open-weight Wan 2.2. */
exports.CONTINUITY_MODEL_ID = 'wan-2.7';
exports.CONTINUITY_SCORE_MIN = 0.62;
exports.VIDEO_REFERENCE_MODELS = [exports.CONTINUITY_MODEL_ID, 'seedance-2.0', 'gemini-omni', 'wan-3.0'];
const LOW_CONTINUITY = new Set([
    'aerial_establishing',
    'environment_travel',
    'fast_draft',
    'product_commercial',
]);
function isVideoReferenceCapable(modelId) {
    return exports.VIDEO_REFERENCE_MODELS.includes(modelId);
}
function continuityPriorityFor(contentType) {
    return contentType && LOW_CONTINUITY.has(contentType) ? 'low' : 'normal';
}
function shouldChain(shot, prev, model) {
    if (!prev)
        return false;
    if (shot.isCut || shot.sceneId !== prev.sceneId)
        return false;
    if (!model.videoReferenceCapable)
        return false;
    if (shot.continuityPriority === 'low')
        return false;
    return true;
}
function chainLink(shot, prev, videoReferenceCapable) {
    if (!prev)
        return 'none';
    if (shot.isCut || shot.sceneId !== prev.sceneId)
        return 'none';
    if (shot.continuityPriority === 'low')
        return 'none';
    return videoReferenceCapable ? 'video' : 'still';
}
/** Same place and time continues. A cut, a new scene, or a location change breaks. */
function shotContinuityFlag(args) {
    if (!args.hasPrev || args.hardCut || !args.sameScene || !args.sameLocation || args.lowPriority)
        return 'cut';
    return 'continuous';
}
/** The routed model wins when it can take video. Otherwise the one config line, if it was selected. */
function chainModelChoice(routedModel, selectedModels) {
    if (isVideoReferenceCapable(routedModel))
        return routedModel;
    if (selectedModels.includes(exports.CONTINUITY_MODEL_ID))
        return exports.CONTINUITY_MODEL_ID;
    if (selectedModels.includes('gemini-omni'))
        return 'gemini-omni';
    if (selectedModels.includes('seedance-2.0'))
        return 'seedance-2.0';
    return null;
}
function partitionContinuity(shots) {
    const chains = [];
    const independents = [];
    let buffer = [];
    const flush = () => {
        if (buffer.length === 0)
            return;
        if (buffer.length === 1 && buffer[0].link === 'none')
            independents.push(buffer[0]);
        else
            chains.push({ shots: buffer });
        buffer = [];
    };
    for (const shot of shots) {
        if (shot.link === 'none') {
            flush();
            buffer = [shot];
        }
        else {
            buffer.push(shot);
        }
    }
    flush();
    return { chains, independents };
}
/** Wan 3.0 output seconds. The 3s clip counts against the 30s clip+output budget. */
function wanChainOutputSeconds(shotSeconds, clipSeconds = exports.CHAIN_CLIP_SECONDS) {
    if (clipSeconds > exports.WAN30_REF_VIDEO_MAX_SECONDS) {
        throw new Error('wan 3.0 reference videos total at most 15 seconds');
    }
    const room = Math.min(exports.WAN30_OUTPUT_MAX, exports.WAN30_OUTPUT_MAX - clipSeconds);
    const wanted = shotSeconds == null || !Number.isFinite(shotSeconds) ? 5 : Math.round(shotSeconds);
    return Math.min(room, Math.max(exports.WAN30_OUTPUT_MIN, wanted));
}
function gateChainLink(gateMode, autoPassed, regenerationsUsed) {
    const checking = gateMode === 'auto' || gateMode === 'both';
    if (checking && autoPassed === false) {
        return regenerationsUsed < exports.CHAIN_REGEN_LIMIT ? 'regenerate' : 'await_user';
    }
    if (gateMode === 'manual' || gateMode === 'both')
        return 'await_user';
    return 'pass';
}
//# sourceMappingURL=chainContinuity.js.map