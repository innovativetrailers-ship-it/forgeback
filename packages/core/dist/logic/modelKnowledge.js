"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listModelKnowledge = listModelKnowledge;
exports.getModelKnowledge = getModelKnowledge;
exports.indexModelKnowledge = indexModelKnowledge;
exports.recordLearnedOutcome = recordLearnedOutcome;
exports.applyLearnedSignal = applyLearnedSignal;
exports.loadLearnedLayer = loadLearnedLayer;
exports.refreshLiveCapability = refreshLiveCapability;
exports.queryModelRAG = queryModelRAG;
const premiseLock_1 = require("./premiseLock");
const learn_1 = require("./learn");
const ratings_1 = require("./ratings");
const toolMatrix_1 = require("./toolMatrix");
const toolControls_1 = require("./toolControls");
const chainContinuity_1 = require("./chainContinuity");
const registry_1 = require("./registry");
const seedance_1 = require("./seedance");
const kling_1 = require("./kling");
const veo_1 = require("./veo");
const wan_1 = require("./wan");
const wan30_1 = require("./wan30");
const grok_1 = require("./grok");
const pixverse_1 = require("./pixverse");
const happyhorse_1 = require("./happyhorse");
const ltx_1 = require("./ltx");
const hailuo_1 = require("./hailuo");
const omni_1 = require("./omni");
const EXPOSURE_ID = { 'hailuo-02': 'hailuo', 'gemini-omni-flash': 'gemini-omni' };
const emptyLearned = () => {
    const learned = {};
    for (const purpose of premiseLock_1.SHOT_PURPOSES)
        learned[purpose] = { worked: 0, total: 0, score: 0 };
    return learned;
};
function schemaOn(cell) {
    return cell === 'schema';
}
function toolsFrom(row, id) {
    const caps = (0, toolControls_1.exposedControls)(id);
    return {
        camera: schemaOn(row?.camera),
        reference: schemaOn(row?.reference),
        firstLast: schemaOn(row?.firstLast),
        nativeAudio: schemaOn(row?.nativeAudio) || caps.nativeAudioLockedOn,
        voice: schemaOn(row?.voice),
        videoReference: schemaOn(row?.videoReference) || (0, chainContinuity_1.isVideoReferenceCapable)(id),
    };
}
function knowledgeTier(id) {
    if (id === 'ltx-2.3-fast' || id === 'hailuo-02')
        return 'draft';
    if (id === 'gemini-omni' || id === 'veo-3.1' || id === 'runway-gen4' || id === 'happyhorse-1.0' || id === 'wan-3.0')
        return 'premium';
    return 'standard';
}
function creditsPerSecond(id) {
    const table = {
        'veo-3.1': 4.6,
        'kling-3.0': 3.4,
        'seedance-2.0': 4,
        'runway-gen4': 4.4,
        'grok-imagine-video': 4,
        'wan-2.7': 1.6,
        'ltx-2.3-fast': 0.4,
        'hailuo-02': 0.6,
        'wan-3.0': 3.2,
        'pixverse-v5.6': 2.4,
        'happyhorse-1.0': 5,
        'gemini-omni': 5,
    };
    if (id === 'gemini-omni')
        return { '360p': 1.5, '720p': 5, '1080p': 7.5, '4k': 15 };
    const n = table[id] ?? 2;
    return { '720p': n, '1080p': n };
}
function maxDurationOf(model) {
    const spec = model.fields.duration;
    if (spec.max != null)
        return spec.max;
    const nums = (spec.values ?? []).map((value) => Number(String(value).replace(/s$/, ''))).filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) : 8;
}
function fieldNames(model) {
    const fields = model.fields;
    const names = [fields.firstFrame, fields.duration.field, fields.audio.field];
    if (fields.lastFrame)
        names.push(fields.lastFrame);
    if (fields.firstFrameForLast)
        names.push(fields.firstFrameForLast);
    if (fields.references.field)
        names.push(fields.references.field);
    if (fields.resolution)
        names.push(fields.resolution.field);
    if (fields.aspect)
        names.push(fields.aspect.field);
    if (fields.negative)
        names.push(fields.negative);
    if (fields.seed)
        names.push(fields.seed);
    return names.filter(Boolean);
}
function liveFrom(model) {
    const liveModes = Object.keys(model.endpoints).filter((mode) => Boolean(model.endpoints[mode]));
    const liveFields = {};
    const names = fieldNames(model);
    for (const mode of liveModes)
        liveFields[mode] = names;
    return { liveModes, liveFields, liveLimits: { maxPromptChars: model.limits.maxPromptChars } };
}
function modeModelFor(id) {
    if (id === 'seedance-2.0')
        return (0, seedance_1.seedanceModeModel)();
    if (id === 'kling-3.0')
        return (0, kling_1.klingModeModel)();
    if (id === 'veo-3.1')
        return (0, veo_1.veoModeModel)();
    if (id === 'wan-2.7')
        return (0, wan_1.wanModeModel)();
    if (id === 'wan-3.0')
        return (0, wan30_1.wan30ModeModel)();
    if (id === 'grok-imagine-video')
        return (0, grok_1.grokModeModel)();
    if (id === 'pixverse-v5.6')
        return (0, pixverse_1.pixverseModeModel)();
    if (id === 'happyhorse-1.0')
        return (0, happyhorse_1.happyhorseModeModel)();
    if (id === 'ltx-2.3-fast')
        return (0, ltx_1.ltxModeModel)();
    if (id === 'hailuo-02')
        return (0, hailuo_1.hailuoModeModel)();
    if (id === 'gemini-omni')
        return (0, omni_1.omniModeModel)();
    return undefined;
}
function embedNeed(text) {
    const axis = ['consistency', 'motion', 'camera', 'audio', 'quality', 'hero', 'fill', 'dialogue', 'continuity', 'draft'];
    return axis.map((word) => (text.some((item) => item.toLowerCase().includes(word)) ? 1 : 0));
}
const DOC = {
    'seedance-2.0': {
        strengths: ['character consistency', 'multimodal composition', 'dialogue audio tags'],
        weaknesses: ['long establishing takes'],
        bestFor: ['consistency', 'dialogue', 'continuity', 'hero'],
        ranks: { consistency: 9, motion: 6, camera: 6, audio: 8, quality: 8 },
    },
    'kling-3.0': {
        strengths: ['human motion', 'action', 'elements on image-to-video'],
        weaknesses: ['no voice_id on v3', 'no seed'],
        bestFor: ['motion', 'camera', 'consistency'],
        ranks: { consistency: 7, motion: 9, camera: 7, audio: 4, quality: 7 },
    },
    'gemini-omni': {
        strengths: ['primary quality t2v', 'first-last on image-to-video', 'video reference and edit'],
        weaknesses: ['max 10s', 'no generate_audio field so native audio cannot be switched off', 'no seed'],
        bestFor: ['hero', 'consistency', 'continuity'],
        ranks: { consistency: 9, motion: 8, camera: 7, audio: 5, quality: 10 },
    },
    'veo-3.1': {
        strengths: ['4K', 'extend for long takes', 'first-last frames'],
        weaknesses: ['secondary to Omni on short quality t2v', 'no video file on reference', 'native audio forced off on submit'],
        bestFor: ['hero'],
        ranks: { consistency: 7, motion: 7, camera: 6, audio: 5, quality: 9 },
    },
    'wan-2.7': {
        strengths: ['budget volume', 'image reference'],
        weaknesses: ['no native audio field', 'no video-reference chain'],
        bestFor: ['fill', 'consistency'],
        ranks: { consistency: 6, motion: 5, camera: 5, audio: 2, quality: 6 },
    },
    'wan-3.0': {
        strengths: ['video reference', '30s takes', 'chained continuity'],
        weaknesses: ['out of the default council', 'reference excludes keyframes'],
        bestFor: ['continuity', 'consistency', 'hero'],
        ranks: { consistency: 8, motion: 6, camera: 5, audio: 4, quality: 8 },
    },
    'happyhorse-1.0': {
        strengths: ['dialogue quality', 'character reference', 'video edit'],
        weaknesses: ['benched until one clean generation', 'no last frame'],
        bestFor: ['dialogue', 'hero', 'consistency'],
        ranks: { consistency: 8, motion: 6, camera: 6, audio: 3, quality: 9 },
    },
    'hailuo-02': {
        strengths: ['cheap pro text', 'fast drafts'],
        weaknesses: ['no reference endpoint', 'pro text has no duration'],
        bestFor: ['draft', 'fill', 'dialogue'],
        ranks: { consistency: 4, motion: 5, camera: 4, audio: 2, quality: 5 },
    },
    'grok-imagine-video': {
        strengths: ['native audio that cannot be switched off', 'image reference'],
        weaknesses: ['no last frame', 'no seed'],
        bestFor: ['fill'],
        ranks: { consistency: 6, motion: 5, camera: 4, audio: 9, quality: 6 },
    },
    'pixverse-v5.6': {
        strengths: ['stylized and anime looks', 'transition last frame', 'negative prompt'],
        weaknesses: ['no character reference endpoint'],
        bestFor: ['stylized', 'camera', 'fill'],
        ranks: { consistency: 4, motion: 6, camera: 8, audio: 3, quality: 6 },
    },
    'ltx-2.3-fast': {
        strengths: ['draft speed', 'last frame on image'],
        weaknesses: ['no character reference', 'no seed'],
        bestFor: ['draft', 'fill'],
        ranks: { consistency: 3, motion: 4, camera: 3, audio: 2, quality: 4 },
    },
};
const store = new Map();
function buildEntry(id, mode, row) {
    const doc = DOC[id];
    const tools = toolsFrom(row, id);
    const live = liveFrom(mode);
    const strengths = doc?.strengths ?? [row?.note ?? id];
    const weaknesses = doc?.weaknesses ?? [];
    const bestFor = doc?.bestFor ?? ['fill'];
    const ranks = doc?.ranks ?? { consistency: 5, motion: 5, camera: 5, audio: 3, quality: 5 };
    return {
        id,
        strengths,
        weaknesses,
        bestFor,
        tools,
        cost: { perSecond: creditsPerSecond(id), tier: knowledgeTier(id) },
        ranks,
        maxDuration: maxDurationOf(mode),
        nativeAudio: tools.nativeAudio,
        videoRefCapable: tools.videoReference,
        ...live,
        learned: emptyLearned(),
        embedding: embedNeed([...strengths, ...bestFor, id]),
        loraCapable: false,
        loraEndpoints: [],
    };
}
function seedStore() {
    if (store.size)
        return;
    for (const id of Object.keys(registry_1.VIDEO_MODEL_REGISTRY)) {
        const mode = modeModelFor(id);
        if (!mode)
            continue;
        const row = toolMatrix_1.TOOL_EXPOSURE.find((item) => item.model === (EXPOSURE_ID[id] ?? id));
        store.set(id, buildEntry(id, mode, row));
    }
}
function listModelKnowledge() {
    seedStore();
    return [...store.values()];
}
function getModelKnowledge(id) {
    seedStore();
    return store.get(id);
}
/** Index or replace an entry. A new model becomes retrievable with no other code change. */
function indexModelKnowledge(entry) {
    seedStore();
    store.set(entry.id, entry);
}
function recordLearnedOutcome(id, purpose, worked) {
    return applyLearnedSignal(id, purpose, worked ? 1 : -1, 'behaviour');
}
function applyLearnedSignal(id, purpose, signal, source = 'behaviour') {
    seedStore();
    const entry = store.get(id);
    if (!entry)
        return undefined;
    entry.learned[purpose] = (0, learn_1.applyOutcome)(entry.learned[purpose], signal, source);
    return entry;
}
function loadLearnedLayer(overlay) {
    seedStore();
    for (const [id, byPurpose] of Object.entries(overlay)) {
        const entry = store.get(id);
        if (!entry)
            continue;
        for (const purpose of premiseLock_1.SHOT_PURPOSES) {
            const cell = byPurpose[purpose];
            if (cell)
                entry.learned[purpose] = cell;
        }
    }
}
async function refreshLiveCapability(id, fetchImpl = fetch) {
    seedStore();
    const entry = store.get(id);
    const mode = modeModelFor(id);
    if (!entry || !mode)
        return entry;
    const { getOpenApiSchema } = await Promise.resolve().then(() => __importStar(require('./modePipeline')));
    const liveFields = { ...entry.liveFields };
    const liveModes = [];
    for (const [modeName, endpoint] of Object.entries(mode.endpoints)) {
        if (!endpoint)
            continue;
        const schema = await getOpenApiSchema(endpoint, fetchImpl);
        liveModes.push(modeName);
        liveFields[modeName] = schema.properties;
    }
    const next = {
        ...entry,
        liveModes: [...new Set(liveModes)],
        liveFields,
        liveFetchedAt: new Date().toISOString(),
    };
    store.set(id, next);
    return next;
}
function constraintBand(tier) {
    if (tier === 'draft')
        return 'draft';
    if (tier === 'blockbuster')
        return 'premium';
    return 'standard';
}
function servesNeed(entry, need) {
    if (!entry.liveModes.includes(need.needs.mode))
        return false;
    if (need.needs.continuity && !entry.videoRefCapable)
        return false;
    if ((need.needs.camera ?? 0) >= 7 && !entry.tools.camera)
        return false;
    return true;
}
function costFor(entry, seconds = 5) {
    return Math.round((entry.cost.perSecond['720p'] ?? 2) * seconds);
}
function constraintFit(entry, tier) {
    if (tier === 'draft')
        return entry.cost.tier === 'draft' ? 1 : entry.cost.tier === 'standard' ? 0.4 : 0.1;
    if (tier === 'blockbuster')
        return entry.cost.tier === 'premium' ? 1 : entry.cost.tier === 'standard' ? 0.6 : 0.2;
    return entry.cost.tier === 'standard' ? 1 : 0.5;
}
function rankFor(entry, purpose, needs) {
    if (purpose === 'consistency' || (needs.consistency ?? 0) >= 6)
        return entry.ranks.consistency;
    if (purpose === 'motion')
        return entry.ranks.motion;
    if (purpose === 'camera' || (needs.camera ?? 0) >= 6)
        return entry.ranks.camera;
    if (purpose === 'dialogue' || needs.audio)
        return entry.ranks.audio;
    if (purpose === 'hero')
        return entry.ranks.quality;
    if (purpose === 'draft' || purpose === 'fill')
        return 10 - Math.min(10, entry.ranks.quality);
    return entry.ranks.quality;
}
function reasonFor(entry, need, score, learned) {
    const w = (0, learn_1.learnedBlendWeight)(learned.total);
    const learnedBit = learned.total
        ? ` Learned ${Math.round(learned.score * 100)}% on ${need.purpose} (${learned.worked}/${learned.total}, weight ${w.toFixed(2)}).`
        : ' No learned outcomes yet.';
    return `${entry.id} for ${need.purpose} on ${need.needs.mode} (score ${score.toFixed(2)}). ${entry.strengths[0] ?? ''}.${learnedBit}`;
}
function queryModelRAG(need, pool, overlay, taste) {
    seedStore();
    const ids = pool?.length ? pool : [...store.keys()];
    const eligible = ids
        .map((id) => store.get(id))
        .filter((entry) => Boolean(entry && servesNeed(entry, need)));
    const band = constraintBand(need.constraint.tier);
    const inBand = eligible.filter((entry) => entry.cost.tier === band);
    const considered = inBand.length ? inBand : eligible;
    const learnedOf = (entry) => overlay?.[entry.id]?.[need.purpose] ?? entry.learned[need.purpose];
    const live = considered.filter((entry) => !(0, learn_1.isCircuitOpen)(learnedOf(entry)));
    const rankable = live.length ? live : considered;
    const ranked = [];
    for (const entry of rankable) {
        const purposeFit = entry.bestFor.includes(need.purpose) ? 1 : 0.15;
        const dim = rankFor(entry, need.purpose, need.needs) / 10;
        const costFit = constraintFit(entry, need.constraint.tier);
        const budgetOk = need.constraint.budgetCents == null
            || costFor(entry) * 100 <= need.constraint.budgetCents;
        if (!budgetOk)
            continue;
        const learned = learnedOf(entry);
        const w = (0, learn_1.learnedBlendWeight)(learned.total);
        const staticPart = purposeFit * 0.55 + dim * 0.3 + costFit * 0.15;
        const learnedPart = learned.total ? learned.score : 0.5;
        const personal = (0, ratings_1.tasteBoost)(entry.id, entry.cost.tier, need.purpose, taste);
        const fitScore = Number(((1 - w) * staticPart + w * learnedPart + personal).toFixed(4));
        ranked.push({
            model: entry.id,
            mode: need.needs.mode,
            fitScore,
            reason: reasonFor(entry, need, fitScore, learned),
            costEstimate: costFor(entry),
        });
    }
    return ranked.sort((a, b) => b.fitScore - a.fitScore);
}
//# sourceMappingURL=modelKnowledge.js.map