"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoDelegatePool = autoDelegatePool;
exports.bumpQualityTier = bumpQualityTier;
exports.assertDelegatedIntegrity = assertDelegatedIntegrity;
exports.delegate = delegate;
const integrity_1 = require("./integrity");
const modePipeline_1 = require("./modePipeline");
const modelKnowledge_1 = require("./modelKnowledge");
const premiseLock_1 = require("./premiseLock");
const resolveModel_1 = require("./resolveModel");
const playbook_1 = require("./playbook");
const trainedAsset_1 = require("./trainedAsset");
function benched(id) {
    return /happy-?horse/i.test(id);
}
/** Indexed models the auto path may pick. HappyHorse stays out until one clean generation. */
function autoDelegatePool(requested) {
    const indexed = (0, modelKnowledge_1.listModelKnowledge)().map((entry) => entry.id).filter((id) => !benched(id));
    // Hosted wan-3.0 is a closed pay-per-call model, benched by decision (Neo, 2026-09-27).
    // The open-weight flagship is Wan 2.2 and belongs to the training/local lane
    // (DEFERRED-REGISTER §O), not this hosted council. A manual model list still includes wan-3.0.
    if (!requested?.length) {
        return indexed.filter((id) => id !== 'wan-3.0' && id !== 'wan-2.2');
    }
    return requested.filter((id) => indexed.includes(id));
}
function bumpQualityTier(tier, moneyShot) {
    if (!moneyShot)
        return tier;
    if (tier === 'draft')
        return 'standard';
    if (tier === 'standard')
        return 'blockbuster';
    return 'blockbuster';
}
function toModeShot(shot) {
    return {
        prompt: shot.visualPrompt ?? shot.prompt ?? '',
        durationSec: shot.duration,
        anchorFrameUrl: shot.anchorFrameUrl ?? shot.storyboardUrl,
        endFrameUrl: shot.endFrameUrl,
        continueExactFrame: shot.continueExactFrame,
        characterIds: shot.characterIds,
        locationId: shot.locationId,
        sourceVideoUrl: shot.sourceVideoUrl,
    };
}
function endpointFor(modelId, mode) {
    const def = (0, resolveModel_1.resolveModel)(modelId);
    const fromMode = def.endpoints?.[mode];
    if (fromMode)
        return fromMode;
    if (mode === 'reference' && def.referenceEndpoint)
        return def.referenceEndpoint;
    if ((mode === 'first_frame' || mode === 'first_last') && def.i2vEndpoint)
        return def.i2vEndpoint;
    if (!def.falEndpoint) {
        throw new integrity_1.ModelIntegrityError(`Model '${modelId}' has no endpoint for mode '${mode}'`);
    }
    return def.falEndpoint;
}
function assertDelegatedIntegrity(chosen) {
    const def = (0, resolveModel_1.resolveModel)(chosen.model);
    const endpoint = endpointFor(chosen.model, chosen.mode);
    const hasStart = chosen.mode === 'first_frame' || chosen.mode === 'first_last';
    const hasRefs = chosen.mode === 'reference';
    (0, integrity_1.assertModelIntegrity)(chosen.model, def, endpoint, hasStart, hasRefs);
}
function hasKeyframe(shot) {
    return Boolean((shot.anchorFrameUrl ?? shot.storyboardUrl)?.trim());
}
function modeForStill(modelId, mode, shot) {
    if (!hasKeyframe(shot) || mode === 'video_edit')
        return mode;
    const hold = (0, resolveModel_1.stillHold)(modelId);
    if (hold === 'reference')
        return mode === 'text' ? 'reference' : mode;
    if (hold === 'first_frame')
        return mode === 'first_last' ? 'first_last' : 'first_frame';
    return mode;
}
function resolveOverride(shot) {
    const raw = (shot.modelOverride ?? '').trim();
    const def = (0, resolveModel_1.resolveModel)(raw);
    const mode = modeForStill(def.canonicalId, (0, modePipeline_1.shotMode)(toModeShot(shot)), shot);
    const purpose = (0, premiseLock_1.deriveShotPurpose)(shot);
    const knowledge = (0, modelKnowledge_1.getModelKnowledge)(def.canonicalId);
    const costEstimate = knowledge
        ? Math.round((knowledge.cost.perSecond['720p'] ?? 2) * 5)
        : 0;
    const chosen = {
        model: def.canonicalId,
        mode,
        reason: `Manual override: ${def.canonicalId} on ${mode}.`,
        costEstimate,
        purpose,
    };
    assertDelegatedIntegrity(chosen);
    return chosen;
}
function logDelegation(shot, chosen) {
    console.log(JSON.stringify({
        event: 'delegation',
        shot: shot.id ?? shot.shotIndex ?? null,
        model: chosen.model,
        purpose: chosen.purpose,
        reason: chosen.reason,
        cost: chosen.costEstimate,
        mode: chosen.mode,
    }));
}
async function delegate(shot, project, pool, learned) {
    if (shot.modelOverride?.trim()) {
        const chosen = resolveOverride(shot);
        logDelegation(shot, chosen);
        return chosen;
    }
    const purpose = (0, premiseLock_1.deriveShotPurpose)(shot);
    const mode = (0, modePipeline_1.shotMode)(toModeShot(shot));
    const tier = bumpQualityTier(project.qualityTier, shot.moneyShot);
    const usable = autoDelegatePool(pool);
    if (purpose === 'stylized') {
        if (!usable.includes('pixverse-v5.6')) {
            throw new integrity_1.ModelIntegrityError('STYLIZED shots require pixverse-v5.6, which is not in the delegate pool');
        }
        const knowledge = (0, modelKnowledge_1.getModelKnowledge)('pixverse-v5.6');
        const chosen = {
            model: 'pixverse-v5.6',
            mode,
            reason: 'STYLIZED: pixverse-v5.6 for stylized, anime, or transition shots. The v5.6/transition endpoint is the transition tool.',
            costEstimate: knowledge ? Math.round((knowledge.cost.perSecond['720p'] ?? 2) * 5) : 0,
            purpose,
        };
        assertDelegatedIntegrity(chosen);
        logDelegation(shot, chosen);
        return chosen;
    }
    const candidates = (0, playbook_1.biasCandidates)((0, modelKnowledge_1.queryModelRAG)({
        purpose,
        needs: {
            mode,
            consistency: shot.consistencyNeed,
            camera: shot.cameraNeed ?? (shot.cameraPrecision ? 8 : undefined),
            audio: shot.needsDialogue ?? shot.hasDialogue,
            continuity: Boolean(shot.chainFrom),
        },
        constraint: {
            tier,
            budgetCents: shot.budget ?? project.budgetCents,
        },
    }, usable, learned, project.taste), purpose, project.playbook, shot.suggestedModel);
    const keyframe = hasKeyframe(shot);
    const capable = keyframe ? candidates.filter((row) => (0, resolveModel_1.stillHold)(row.model)) : candidates;
    if (keyframe && !capable.length && candidates.length) {
        console.warn('[delegate] keyframe shot forced onto a model with no still endpoint', JSON.stringify({
            shot: shot.id ?? shot.shotIndex ?? null,
            model: candidates[0]?.model ?? null,
        }));
    }
    const top = (capable.length ? capable : candidates)[0];
    const loraAsset = shot.characterLora ?? shot.styleLora ?? undefined;
    const loraEndpoint = loraAsset ? (0, trainedAsset_1.loraEndpointForMode)(loraAsset, mode) : null;
    if (loraAsset?.loraUrl?.trim() && !loraEndpoint) {
        throw new integrity_1.ModelIntegrityError(`Trained LoRA has no inference path for mode ${mode}`);
    }
    if ((0, trainedAsset_1.shouldDelegateTrainedLora)({
        purpose,
        consistencyNeed: shot.consistencyNeed,
        hasLoraAsset: Boolean(loraAsset?.loraUrl),
        assetType: shot.characterLora ? 'character' : shot.styleLora ? 'style' : null,
        modelOverride: shot.modelOverride,
        learned,
        loraEndpoint,
    }) && loraEndpoint) {
        const chosen = {
            model: loraEndpoint,
            mode: modeForStill(loraEndpoint, mode, shot),
            reason: `${top?.reason ?? 'Trained LoRA.'} ${trainedAsset_1.TRAINED_LORA_DELEGATION}`,
            costEstimate: top?.costEstimate ?? 0,
            purpose,
        };
        assertDelegatedIntegrity(chosen);
        logDelegation(shot, chosen);
        return chosen;
    }
    if (!top) {
        throw new integrity_1.ModelIntegrityError(`No indexed model serves purpose '${purpose}' on mode '${mode}' under ${tier}`);
    }
    const chosen = {
        model: top.model,
        mode: modeForStill(top.model, top.mode, shot),
        reason: top.reason,
        costEstimate: top.costEstimate,
        purpose,
    };
    assertDelegatedIntegrity(chosen);
    logDelegation(shot, chosen);
    return chosen;
}
//# sourceMappingURL=delegate.js.map