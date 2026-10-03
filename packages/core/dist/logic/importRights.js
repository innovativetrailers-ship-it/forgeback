"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingConsentError = exports.PLATFORM_TRAINS_ON_USER_CONTENT = exports.COPYRIGHT_CONSENT_DOMAINS = exports.IMPORT_DOMAINS = void 0;
exports.isImportDomain = isImportDomain;
exports.importPrep = importPrep;
exports.domainFromSubcategory = domainFromSubcategory;
exports.assertTrainingConsent = assertTrainingConsent;
exports.cameraPatchFromPreset = cameraPatchFromPreset;
const trainerRegistry_1 = require("./trainerRegistry");
const genrePresets_1 = require("./genrePresets");
exports.IMPORT_DOMAINS = ['movie', 'tv', 'anime', 'documentary', 'sport', 'racing'];
exports.COPYRIGHT_CONSENT_DOMAINS = ['movie', 'tv', 'anime'];
/** User content is never used to train platform models. */
exports.PLATFORM_TRAINS_ON_USER_CONTENT = false;
function isImportDomain(value) {
    return exports.IMPORT_DOMAINS.includes(value);
}
function pickTrainer(key) {
    const trainer = (0, trainerRegistry_1.trainerDef)(key);
    if (!trainer)
        throw new Error(`${key} trainer missing`);
    return trainer;
}
function captionFor(domain) {
    switch (domain) {
        case 'movie':
            return 'Caption each clip with shot size, motivated light, and production design. Vary angles; keep grade consistent.';
        case 'tv':
            return 'Caption episodic coverage: character blocking, interior practicals, recurring set. Consistency across episodes is the point.';
        case 'anime':
            return 'Caption frames with line quality, palette, and motion (hold, smear, or pers). Own or licensed material only.';
        case 'documentary':
            return 'Caption handheld vs locked-off, available light, archival vs observational. Note narrator space if present.';
        case 'sport':
            return 'Caption play vs sideline vs crowd. Note lens length, slow-mo vs live, broadcast graphics if in frame (describe, do not copy marks).';
        case 'racing':
            return 'Caption onboard vs chase vs pit. Note speed smear, weather, and track vs cockpit.';
    }
}
function trainerKeyFor(domain, kinds, tab) {
    if (tab === 'cast' || tab === 'assets')
        return 'h3-ref2va';
    if (tab === 'music')
        return 'stable-audio-3';
    if (domain === 'anime') {
        if (kinds.has('image') && !kinds.has('video'))
            return 'flux-2';
        return 'ltx-23-video';
    }
    if (domain === 'racing' || domain === 'sport') {
        if (kinds.has('audio') && !kinds.has('video') && !kinds.has('image'))
            return 'stable-audio-3';
        if (kinds.has('video'))
            return 'ltx-23-video';
        return 'h3-t2v';
    }
    if (kinds.has('image') && !kinds.has('video'))
        return 'flux-2';
    return 'h3-t2v';
}
function importPrep(input) {
    const kinds = new Set(input.kinds ?? []);
    const trainerKey = trainerKeyFor(input.domain, kinds, input.tab);
    const requiresOwnedOrLicensed = exports.COPYRIGHT_CONSENT_DOMAINS.includes(input.domain);
    const requiresSubjectConsent = input.tab === 'cast' || input.tab === 'voices';
    return {
        domain: input.domain,
        captionGuidance: captionFor(input.domain),
        trainerKey,
        trainer: pickTrainer(trainerKey),
        isolateSubject: input.tab === 'cast' || input.tab === 'assets',
        requiresOwnedOrLicensed,
        requiresSubjectConsent,
        rightsNotice: requiresOwnedOrLicensed
            ? 'Confirm you own or are licensed for this movie/TV/anime material. It is held only to train your LoRA. The platform does not train its models on it.'
            : 'Imported media is yours. It is held only to train your LoRA and is deleted with the asset. The platform does not train its models on it.',
    };
}
function domainFromSubcategory(subcategory) {
    if (subcategory && isImportDomain(subcategory))
        return subcategory;
    if (subcategory && (0, genrePresets_1.isGenreFamily)(subcategory))
        return subcategory;
    return null;
}
class TrainingConsentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TrainingConsentError';
    }
}
exports.TrainingConsentError = TrainingConsentError;
function assertTrainingConsent(input) {
    const domain = input.importDomain && isImportDomain(input.importDomain)
        ? input.importDomain
        : domainFromSubcategory(input.subcategory);
    const copyrighted = Boolean(input.footageIncludesCopyrightedTitles
        || (domain && exports.COPYRIGHT_CONSENT_DOMAINS.includes(domain)));
    if (copyrighted && input.ownedOrLicensed !== true) {
        throw new TrainingConsentError('Confirm you own or are licensed for this movie/TV/anime material before training');
    }
    if ((input.tab === 'cast' || input.tab === 'voices') && input.subjectConsent !== true) {
        throw new TrainingConsentError('Confirm the subject consents to a face LoRA or voice clone before training');
    }
}
function cameraPatchFromPreset(defaults, current) {
    return {
        ...(current.cameraAngle?.trim() ? {} : defaults.angle ? { cameraAngle: defaults.angle } : {}),
        ...(current.cameraMove?.trim() ? {} : defaults.movement ? { cameraMove: defaults.movement } : {}),
        ...(current.shotSize?.trim() ? {} : defaults.shotSize ? { shotSize: defaults.shotSize } : {}),
        ...(current.lensFeel?.trim() ? {} : defaults.lens ? { lensFeel: defaults.lens } : {}),
        ...(current.cameraSpeed?.trim() ? {} : defaults.speed ? { cameraSpeed: defaults.speed } : {}),
    };
}
//# sourceMappingURL=importRights.js.map